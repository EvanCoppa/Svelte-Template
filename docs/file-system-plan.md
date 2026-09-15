# File system — the simple plan

> **Status: planning only.** This document proposes an MVP for a Google Drive-style
> file system backed by Supabase Storage. It is suitable for a docs-only PR. It does
> not add application code, migrations, generated types, or a new feature registration.

## The one idea

The file system has two authorities:

| concern                                              | authority                       | rule                                                                                |
| ---------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| folders, names, relationships, metadata, trash state | Postgres                        | the database is the source of truth for what a member sees                          |
| file bytes                                           | private Supabase Storage bucket | the object is addressed by an immutable file id, not by a user-editable folder path |

The MVP is a small, organization-scoped file cabinet:

- a folder tree, including empty folders;
- files listed inside folders;
- upload and download;
- rename and move;
- trash and restore;
- basic metadata and search;
- access for organization members through the existing tenant model.

It is deliberately not a Google Drive clone. There is no realtime co-editing, document
editor, public sharing link, versioned content, complex permissions matrix, sync client,
or full-text content indexing in this phase.

## What the repository already gives us

The plan should reuse these conventions rather than create a second way to do tenancy,
records, or storage:

| existing pattern                               | reuse                                                         | add for files                                              |
| ---------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `organizations` + `organization_members`       | `org_id` on every file-system row                             | none                                                       |
| `private.org_role(org_id)`                     | all table and Storage authorization checks                    | policies specific to file/folder actions                   |
| `created_by`, timestamps, `updated_at` trigger | authorship and ordinary metadata                              | file/folder rows and an append-only event row if approved  |
| `archived_at` on notes                         | the repository's soft-state vocabulary                        | prefer a more explicit `trashed_at` for file semantics     |
| `entity_images`                                | private bucket, first path segment is the org id, Storage RLS | a separate general-purpose private bucket and file-id path |
| server-side Supabase clients and form actions  | privileged signed URL creation and mutations                  | file-system server module/routes                           |
| feature registry and page registry             | later feature/page registration                               | not part of this planning-only PR                          |

Relevant references are [the multi-tenancy rules in `CLAUDE.md`](../CLAUDE.md),
[`entity_images` and its private bucket policies](../supabase/migrations/20260911090300_entity_images.sql),
and the existing notes/documents discussion in
[`notes-and-documents-plan.md`](notes-and-documents-plan.md). The latter is about
long-form CRM documents; this file system should remain a separate, simpler concern.

## MVP boundary

### In scope

1. List the virtual root and any folder's direct children.
2. Create an empty or populated folder.
3. Upload a file into the root or a selected folder.
4. Download a file through a short-lived signed URL.
5. Rename or move a file or folder.
6. Move a file to trash and restore it.
7. Move an empty folder to trash and restore it.
8. Show name, type, size, creator, and created/updated timestamps.
9. Search active file and folder names within the active organization.
10. Keep a small mutation history for accountability.

### Deliberately deferred

- per-file ACLs, external collaborators, and public links;
- file versions or content snapshots;
- previews, thumbnails, OCR, virus scanning, and content extraction;
- resumable/TUS uploads and background processing;
- duplicate content detection and deduplication;
- recursive folder trash/restore;
- full-text search inside file contents;
- client-portal access rules;
- CRM record links;
- retention policies and irreversible purge automation.

These are plausible follow-on phases, not hidden requirements of the MVP.

## Proposed data model

The names below are planning names. The implementation should follow the repository's
normal migration workflow and canonical tenant-scoped table shape when this plan is
approved.

### `file_folders`

One row is one logical folder. An absent `parent_id` means the organization root; there
is no Storage object for a folder, so empty folders work naturally.

| column                            | purpose                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `id uuid`                         | stable folder identity                                           |
| `org_id uuid`                     | organization scope, required and indexed                         |
| `parent_id uuid nullable`         | self-reference to another folder in the same organization        |
| `name text`                       | display name                                                     |
| `name_key text`                   | normalized comparison key for sibling-name uniqueness and search |
| `created_by uuid`                 | member who created it                                            |
| `created_at`, `updated_at`        | ordinary timestamps                                              |
| `trashed_at timestamptz nullable` | soft-delete state; null means active                             |
| `trashed_by uuid nullable`        | actor who trashed it                                             |

Use a composite relationship or equivalent database validation so a folder cannot point
at a parent from another organization. A folder cannot be moved beneath itself or one of
its descendants.

### `files`

One row is one logical file and one Storage object. The row is the authority used for
listing, authorization, search, and download preparation.

| column                            | purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `id uuid`                         | stable file identity and Storage path component                    |
| `org_id uuid`                     | organization scope, required and indexed                           |
| `folder_id uuid nullable`         | containing folder; null means root                                 |
| `name text`                       | user-visible filename, independent of the object key               |
| `name_key text`                   | normalized sibling-name comparison/search key                      |
| `storage_path text`               | immutable path inside the private bucket                           |
| `mime_type text nullable`         | detected or client-provided type for display/download headers      |
| `size_bytes bigint`               | authoritative byte count after upload                              |
| `checksum text nullable`          | optional later integrity/deduplication field; not required to ship |
| `created_by uuid`                 | uploader/creator                                                   |
| `created_at`, `updated_at`        | ordinary timestamps                                                |
| `trashed_at timestamptz nullable` | soft-delete state; null means active                               |
| `trashed_by uuid nullable`        | actor who trashed it                                               |

`storage_path` is not writable after insert. Renaming changes `name` and moving changes
`folder_id`; neither operation moves or rewrites bytes.

### Name uniqueness and duplicates

For the simple MVP, active sibling names are unique case-insensitively across both files
and folders. This avoids ambiguous restores, makes a folder listing predictable, and is
easier to explain than Google Drive's allowance for duplicate names. `name_key` should
trim whitespace, normalize Unicode consistently, and case-fold for comparison.

Trashed rows do not occupy an active sibling name. A restore that collides with a new
active item must fail with a clear rename-or-move choice; it must not silently overwrite
or relocate the restored item. If product research later requires duplicate names, the
uniqueness rule can be relaxed without changing the Storage path strategy.

## Storage object path strategy

Use a new private bucket, tentatively `files`, with this immutable object path:

```text
{org_id}/{file_id}/content
```

This keeps the repository's existing load-bearing convention — the first path segment is
the organization id — while avoiding the main trap of a Drive-like system: folder names
and filenames change. A rename or move is a metadata-only transaction. The UI's current
`name` is used as the download filename and does not need to match the object key.

The upload sequence should be:

1. Validate the authenticated member, target folder, normalized name, and size/type
   limits on the server.
2. Insert a file row with a generated `id` and the deterministic `storage_path`.
3. Create a short-lived signed upload URL, or authorize the authenticated upload against
   the pre-created row.
4. Upload the bytes.
5. Confirm the object exists and record its authoritative size/type before marking the
   row available to normal listings.
6. If upload fails, remove the pending row and object through a controlled cleanup path.

A small `upload_state` (`pending`, `ready`, `failed`) is optional. If the first
implementation can keep the operation synchronous, a pending row may instead be hidden
from ordinary listings and cleaned up by a later maintenance job. The important rule is
that an object is never discoverable merely because someone guessed a path.

Do not put user-entered folder names, slashes, or the original filename in the Storage
key. The logical path is data in Postgres; the physical key is a stable opaque address.

## Folder and file behavior

### Root and empty folders

The root is virtual (`folder_id is null`) and is not stored as a special row. Empty
folders are ordinary `file_folders` rows and remain visible in listings. Creating a
folder never requires an object upload.

The MVP allows trashing only an empty folder. This keeps trash/restore atomic and avoids
surprising recursive behavior. A later phase can add an explicit "trash folder and its
contents" operation with a tested subtree transaction.

### Listing and search

- Default listing returns direct active children of one folder, folders first, then files,
  sorted by normalized name and a stable id tie-breaker.
- The trash view is a separate query over `trashed_at is not null`; normal listings never
  mix trashed rows with active rows.
- Search is organization-scoped and searches active names, with optional filters for
  folder, file/folder kind, MIME type, and creator.
- Start with indexed prefix/substring name search. Do not add content indexing or an
  external search service until name search is demonstrably insufficient.

### Rename and move

Rename and move are metadata mutations with the same authorization check as upload. A
move validates that the destination folder belongs to the same organization, is active,
and is not the item itself or a descendant. The server re-checks sibling-name uniqueness
at write time so two tabs cannot create the same active name.

### Trash, restore, and permanent deletion

The MVP's user-facing delete is **trash**, represented by `trashed_at`; there is no
separate archive flag. If the product wants the word “archive” in the UI, it should be
an alias for this reversible state until a distinct business meaning appears.

- Any authorized member may trash an active file; empty folders follow the same rule.
- Restore returns the item to its previous folder if that folder still exists and is
  active. If the original folder is gone or the name collides, restoration stops with an
  actionable error rather than silently moving to root.
- Permanent purge is deferred. When needed, restrict it to owner/admin, delete the
  Storage object and metadata together, and retain the event record according to the
  organization's retention policy.

## Access model and RLS

Use the repository's canonical organization-scoped access model:

- enable RLS on every new public table;
- select checks use `private.org_role(org_id) is not null`;
- write checks use the least privilege that the feature needs, with owner/admin-only
  permanent deletion if that operation is added;
- never authorize from user-editable `user_metadata`;
- never query `organization_members` directly from policies when the existing private
  helper is available;
- every `UPDATE` policy has both `USING` and `WITH CHECK` clauses;
- keep `org_id`, ownership, and `storage_path` immutable from browser writes through
  column-level grants or server-only mutation paths.

For the first collaborative MVP, all organization members may list, create, rename,
move, upload, download, trash, and restore files within their organization. If the
product instead wants creator-only edits, make that a deliberate role decision before
writing policies; do not accidentally encode it by copying a notes policy.

Folder/file relationships need the same-org invariant at the database boundary, not just
in UI code. A server action should validate it for useful errors, while a composite
foreign key, trigger, or equivalent constraint prevents a race or alternate client from
creating a cross-organization relationship.

### Storage policies

The bucket is private. Storage policies should:

- derive the org from `storage.foldername(name)[1]`;
- require an authenticated member of that organization for object read/insert;
- require the object path to match a file row where practical, preventing orphan paths;
- allow object update only if upload replacement is intentionally supported;
- restrict object delete to the same actor policy as metadata purge.

The existing `entity-images` policy is the closest repository example, but its
filename-bearing path should not be copied for this feature. The file-id path is what
makes moves and renames cheap and safe.

## Signed URLs and upload limits

All downloads use short-lived signed URLs generated after a server-side metadata/RLS
check. A URL should be valid only long enough for the requested transfer (for example,
one to five minutes), and it should use the stored display name as the download name.
Do not return a service-role client, Storage secret, or long-lived public URL to the
browser.

Start with a conservative limit of 100 MiB per file and a small batch limit in the UI.
Enforce the byte limit server-side and verify the final object size after upload; client
reported size is only a hint. Defer organization-wide quota accounting until plan tiers,
billing, and cleanup semantics are known. If larger files become a real requirement,
add resumable uploads as a separate design rather than quietly weakening the first limit.

The initial allowlist should be based on business need, not an attempt to classify every
possible MIME type. Store the detected MIME type, preserve the original extension in the
display name, and treat content sniffing/antivirus scanning as a later security phase.

## Filename and path safety

Validate names on the server and in the UI for feedback:

- reject empty names, NUL bytes, control characters, `/`, and `\\`;
- trim outer whitespace and normalize Unicode consistently;
- cap the display name at a documented length (recommendation: 255 Unicode code
  points, with a lower UI limit if needed);
- do not interpret `.` or `..` as navigation;
- do not use the name to construct a Storage key or SQL fragment;
- escape the name for HTML and use a safe `Content-Disposition` filename when downloading;
- keep MIME type and size as metadata, never as authorization inputs.

The database should store both the display name and its comparison key. The comparison
key is for uniqueness/search only; it is not shown to users and should not replace the
original Unicode name.

## Audit and history expectations

The MVP does not need content version history. `updated_at` tells us when current
metadata changed; it does not pretend to reconstruct old bytes.

For accountability, add a small append-only file event table when the schema phase is
implemented. Each event should include:

- `org_id`, `file_id` or `folder_id`, and `actor_id`;
- an action such as `created`, `uploaded`, `renamed`, `moved`, `trashed`, `restored`, or
  `purged`;
- timestamp;
- a compact JSON payload with before/after name or parent where useful.

Log successful mutations, not every keystroke. Download events are optional in the MVP;
add them if the product has a compliance requirement, because high-volume download logs
can become a cost and retention problem. Keep events after purge only if the retention
policy requires it; otherwise document the deletion boundary.

Do not reuse CRM activities for technical file mutations. CRM activities are business
timeline entries; file events answer a security and operational question and should not
pollute record timelines.

## Later CRM and client-portal connections

The core file row should not become a polymorphic CRM record in the MVP. Add a separate
link table later, shaped like the repository's existing polymorphic relationships:

```text
file_links
  org_id
  file_id
  entity_type   -- existing crm_entity_type, after an explicit enum review
  entity_id
  created_by
  created_at
```

That lets a proposal, company, contact, job, or other record point to a file without
putting CRM-specific columns on `files`. The link table must verify that the target
record belongs to the same organization, and its RLS should require both file access and
record access. Deleting a CRM record should remove or detach links according to the
existing record-deletion convention; it should not silently delete the underlying file.

For client portals, add a separate portal-share/grant model rather than making the
organization bucket public. A portal member should receive access only after a
server-side check of the portal grant, the linked file/folder, expiration, and download
permission. The same private object gets a short-lived signed URL; the portal never sees
the Storage secret or an unscoped public URL. Folder shares should be explicit about
whether they include future children, because that choice materially changes the
security model.

## Implementation phases

### Phase 0 — confirm the contract

- settle the product name and route/feature id;
- confirm member permissions and the 100 MiB starting limit;
- confirm unique active sibling names;
- decide whether to ship the append-only event table in the first schema migration;
- document the private bucket name and retention/deletion boundary.

**Exit:** the data, access, and lifecycle decisions above are approved without adding
portal or CRM requirements to the MVP.

### Phase 1 — metadata and folder tree

- add the folder/file metadata tables, constraints, indexes, and RLS;
- add empty-folder creation, folder listing, rename, move, and active/trash queries;
- register the feature/page only when the product is ready for an application PR;
- add server-side name normalization and same-org relationship validation.

**Exit:** a member can create a nested empty tree, list it, rename it, move it, and see
only their organization's active metadata.

### Phase 2 — bytes and basic search

- add the private bucket and Storage policies;
- implement pre-created file rows plus signed upload/download flow;
- verify final size/type and hide incomplete uploads;
- add file listing metadata and name search.

**Exit:** a file can be uploaded into a folder, downloaded by an authorized member, and
renamed/moved without changing its Storage object path.

### Phase 3 — trash, restore, and history

- add file/folder trash and restore actions;
- enforce the empty-folder rule and restore conflict behavior;
- add append-only mutation events if Phase 0 approved them;
- add cleanup for failed uploads and an operator-safe purge path only if required.

**Exit:** the lifecycle is reversible, conflict-safe, and observable without claiming
to provide version history.

### Phase 4 — integrations, only when needed

- add `file_links` for CRM records;
- add portal grants and server-mediated signed URLs;
- revisit recursive folder sharing, previews, quotas, scanning, and versions one at a
  time with separate acceptance criteria.

**Exit:** integrations preserve the file system's organization boundary and do not turn
the MVP into a general collaboration platform.

## Open decisions

1. Should all members manage all files, or should member/manager roles differ for rename,
   move, trash, and restore?
2. Is 100 MiB a good first limit for the target organizations, and is a batch count limit
   needed in addition to the per-file limit?
3. Should the mutation event table ship in Phase 1 or Phase 3, and how long are events
   retained?
4. Does the UI call the reversible state “Trash,” “Archive,” or both? The schema should
   keep one state until the meanings diverge.
5. Are unique active sibling names acceptable, or is duplicate-name parity with Drive a
   product requirement?
6. Does the first upload flow need resumable uploads, or is a synchronous 100 MiB flow
   sufficient?
7. When CRM links arrive, which `crm_entity_type` values are allowed and how should
   record deletion detach links?
8. For portal folder shares, do future children inherit access, or must each file be
   explicitly granted?

## Validation checklist

Before implementation is considered complete, verify:

- [ ] The plan remains docs-only: no application code, migration, or generated type was
      changed in the planning PR.
- [ ] Every metadata table is organization-scoped, indexed by `org_id`, and has RLS
      enabled.
- [ ] Policies use `private.org_role(org_id)` and do not trust user-editable metadata.
- [ ] `UPDATE` policies include both `USING` and `WITH CHECK`.
- [ ] Cross-organization folder/file relationships are blocked at the database boundary.
- [ ] The bucket is private and Storage policies derive the org from the first path
      segment.
- [ ] Storage paths use `{org_id}/{file_id}/content`; rename and move do not move bytes.
- [ ] Uploads cannot create discoverable orphan objects or leave visible pending rows.
- [ ] Signed download URLs are short-lived and generated only after authorization.
- [ ] The byte limit and filename/path validation are enforced server-side.
- [ ] Empty folders survive without a placeholder object.
- [ ] Duplicate active sibling names have one documented behavior and a race-safe check.
- [ ] Trash is hidden from ordinary listings; restore handles missing parents and name
      collisions explicitly.
- [ ] Permanent deletion, if added, has a clear actor restriction and retention rule.
- [ ] Mutation history is append-only and distinct from CRM activities.
- [ ] CRM links and portal grants are additive and do not make the org bucket public.
- [ ] `git diff --check`, the repository's docs formatting/lint checks, and the relevant
      schema/security review pass before the implementation PR begins.
