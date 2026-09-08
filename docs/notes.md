# Notes: a general table, and a dock on the edge of the screen

The brief was [holdmynotes.app](https://holdmynotes.app/) — a Mac app whose notes live
as a thin colored stripe on the edge of the screen, fan out when you point at them,
open where they are, save themselves 250 ms after you stop typing, and archive instead
of deleting — rebuilt inside this app, self-contained, over a **general** notes table
rather than a table that only the sticky-note surface could ever use.

That "general" is the whole design. The feature is one route, one endpoint, one
component family and one migration; the table underneath is deliberately not part of
that feature. Anything in the app can point a note at any record, and the first two
things to do it are the ones shipped here: `/notes` and a record page's own card.

## Why `notes` is a table at all

The `crm_activities_tags` migration deleted a table called `notes` and said why: a
comment on a client is not its own kind of row, it is the degenerate activity where
nothing happened except that somebody wrote something down. That reasoning is intact,
and this table does not walk it back. The split is:

| An activity                    | A note                                      |
| ------------------------------ | ------------------------------------------- |
| A **moment**: `occurred_at`    | A **document**: opened and edited for weeks |
| Written once, read forever     | Rewritten every time you look at it         |
| Belongs to a record's timeline | Belongs to whoever wrote it                 |
| Has a direction and a duration | Has a color and an archive state            |

Storing a document as a timeline entry means every keystroke rewrites history, and a
record's timeline fills up with scratch nobody logged. So: `activities` keeps the log,
`notes` keeps the writing.

## The table

`supabase/migrations/*_notes.sql`. The canonical tenant shape — `org_id` with the
cascade, RLS on, member-writable, column grants keeping `org_id` and `author_id` out of
the browser's reach — plus:

- **`entity_type` + `entity_id`**, the same polymorphic link `activities`, `addresses`,
  `taggings` and `custom_field_values` use. Nullable, and null is the common case: a
  note about nothing in particular is still a note. Nothing points _at_ a note — it is
  not a `crm_entity_type`, has no record page and no list row.
- **`body text not null default ''`**. Blank is legal: a note is created empty and typed
  into, which is exactly why there is no `activities_says_something` equivalent.
- **`color public.badge_tone`** — the ten tones the app already owns, so a sticky note
  can never be a color nothing else in the app is.
- **`archived_at`** — off the desk, not gone. Nullable rather than a boolean, so the row
  records _when_.

RLS mirrors `activities` exactly: every member reads, anyone writes their own, the
author or an owner/admin edits and deletes. The one deliberate difference is that the
entity link is **updatable** — you jot something down and attach it to the record it
turned out to be about, which is the note working, not history being rewritten.

**Deleting the record a note points at detaches the note** (`on_crm_entity_deleted()`
grows one branch, as that function's contract requires). Activities are facts about the
record and go with it; a note is something a person wrote, and deleting a company
should not shred the writing that happened to be pinned to it.

## Registration

Ordinary, and worth reading as the reference for "add a feature": one `features` row
(`notes`, route `/notes`, icon `sticky-note`), one `pages` row with a null title,
`industry_features` for every industry (every vertical writes things down, and none of
them calls it anything else), `tier_features` for every tier, and `role_permissions`
derived from what each role can already do: **a role that may change anything may write
notes; a role that may only look at things may only read them.** The nav entry, the ⌘K
row, the page title and the feature gate all follow from those rows — see
[features.md](features.md).

## Why the writes are an endpoint

Every other mutation in this app is a form action, and CLAUDE.md means it. Notes take
two of the listed exceptions at once:

1. **Cross-page.** The dock is mounted by the `(app)` layout and floats over every
   screen. There is no page action for it to post to.
2. **Multi-verb REST.** `POST /api/notes`, `PATCH /api/notes/<id>`,
   `DELETE /api/notes/<id>`.

And there is no form: a note is created blank and typed into. The staff page's invite is
the precedent for a screen whose creation is genuinely special keeping its own path and
saying why — this is that, one level up.

`hooks.server.ts` resolves no org context for `/api/*`, so `requireNoteAccess()` in
`src/lib/server/notes.ts` does it itself and then asks exactly what a page load asks:
the feature's mode for the org, then the caller's grant (`manage` to write, `delete` to
remove). RLS narrows both again to the note's own author. That costs the endpoint one
org-context round trip a page gets for free, and it is what keeps "who may write" a
single story instead of "RLS, except on the API".

## The modules

| File                                  | What it owns                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/server/crm/notes.ts`         | The table. `listNotes` / `createNote` / `updateNote` / `deleteNote`.                   |
| `src/lib/server/notes.ts`             | The guard, `noteColumns()`, `noteAccess()`, `noteLinks()`.                             |
| `src/lib/schemas/notes.ts`            | The bodies `/api/notes` accepts, and the length constraints.                           |
| `src/lib/notes.ts`                    | What a note IS to the browser: label, search, markdown, colors, who may edit it. Pure. |
| `src/lib/notes-api.ts`                | `noteCommands` — the four writes, with the refresh and the error toast in them.        |
| `src/lib/components/note/`            | `Note.Card` / `Editor` / `Palette` / `Actions`, composed by every surface.             |
| `src/lib/components/note-dock.svelte` | The dock itself, mounted once by the `(app)` layout.                                   |

`$lib/notes.ts` is split from `$lib/notes-api.ts` for one concrete reason: the API half
imports `$app/navigation`, which cannot be imported in a node test. Keeping the rules
about what a note is on the pure side is what makes them testable.

## The three states

The dock is the product's signature, so it is built the way the Mac app describes it:

- **At rest** — one colored dash per open note, a few pixels wide, on the right edge.
- **Fanned** — pointing at it (or focusing it) opens a 20rem panel listing every note by
  its label: its title, or its first line if it has none.
- **Open** — picking one replaces the list with the note at full size, editing in place.

`⌥⌘L` leaves all of it for `/notes`, which is the same notes with room to search them.
Escape steps back one level at a time. The pointer leaving closes the fan, but never
while a note is open — closing a note someone is typing into is the one thing the
interaction must not do.

The dock is `hidden md:block`: a fixed rail on a phone fights the mobile sidebar, and
`/notes` is the whole feature on a small screen.

## Saving

`Note.Editor` accumulates a patch and sends it `AUTOSAVE_DELAY` (250 ms) after the last
keystroke, and immediately on blur or unmount. It seeds its values from the note
**once**: a save echoes the row back and the shell reloads its notes, and re-seeding on
that would yank the caret out of the sentence being typed. A surface that shows a
different note in the same slot keys the component on `note.id` and gets a fresh one.

Freshness is one key. Every surface that shows a note declares `depends(QUERY.notes)` —
the `(app)` layout for the dock, `/notes`, and the record page — so one
`invalidate(QUERY.notes)` after a write puts all three in step.

Saving is silent on purpose: an autosave that toasts every 250 ms is a notification
stream. Only archiving and deleting say anything, and only failures interrupt.

## What a surface may offer

`noteAccess()` builds one object per load — the session's grants plus who is looking —
and `canEditNote()` / `canArchiveNote()` / `canRemoveNote()` apply the same rule the
policies do. A member with `manage` on notes still cannot edit a colleague's note, so
the editor is not offered for a save that RLS would refuse: somebody else's note opens
as text.

## Deliberately not here (yet)

- **Tags on a note.** The search box reads titles and bodies, not tags. Tagging goes
  through `taggings` and the shared link, so tagging a note means adding `note` to
  `crm_entity_type` — and Postgres refuses to use an enum value added in the same
  transaction, so it is two migrations. Worth doing; not worth a second tagging
  mechanism.
- **Re-pointing a note from the UI.** The column grant allows it and the data module
  would take it; what is missing is a record picker. A note is born attached (from a
  record page) or unattached (from the dock) today.
- **Reordering the rail.** Notes sit newest first, by creation rather than by edit, so a
  note never climbs the rail while it is being typed into. Drag-to-reorder would need a
  `position` column and nothing yet asks for one.
- **A no-JavaScript path.** The whole surface is autosave and hover; there is no form to
  post without it.
- **Per-user private notes.** Notes are org-scoped like everything else here (`profiles`
  is the one deliberate exception): the point of writing something down next to a
  company is that whoever covers for you can read it.
