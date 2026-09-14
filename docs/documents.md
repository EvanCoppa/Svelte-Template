# Documents

> The table is `documents`, the feature id is `documents`, the route is `/documents`, and
> the screen says whatever the org's industry calls it — "Pages" by default, "Job files"
> to a roofer, "Chart notes" in a practice. `public.pages` was already taken by the
> route/title registry, so the schema keeps the unambiguous name and
> `recordTerms(page.data.terms, 'document')` supplies the word. **Never put "page" in a
> `documents` identifier, and never hardcode either word in `src/`.**

## The one idea

Three layers, and the whole design is that each one knows about the other two:

| layer         | the question it answers                    | the test                                        |
| ------------- | ------------------------------------------ | ----------------------------------------------- |
| **Notes**     | "I need somewhere to put this right now."  | Would you mind if it vanished in a month?       |
| **Documents** | "I'm working on / writing something down." | Does it have a title someone else would search? |
| **Records**   | "The business tracks this."                | Does anything sum, sort or filter on it?        |

A phone number for ten minutes is a note. An account strategy is a document. A company is
a record. Documents were the missing middle: notes are a textarea, proposals are priced
line items, a custom field is one value — nothing held the **paragraph**.

**What makes it this app's document rather than a wiki is the `@`.** Every noun in the
prose can be a live reference to a record that already has a page, a feature gate and a
name in the org's industry. That is what lets a company's record page answer _"what have
we written about this account?"_ — a question no note, activity or custom field has ever
been able to answer.

## What it is NOT, on purpose

Notion's model is _everything is a page, and a database is a page of pages._ This app's
model is the opposite and stronger: **a record is a row with a type, RLS, an industry
name and a list its industry chose.** Do not invert it.

- **No database blocks.** A table-of-records inside a document would be a second,
  untyped, ungated record system living in jsonb. Embedding a `views` row (a real,
  gate-checked query) is the honest version, and it lands with the `/view` block.
- **No per-page sharing.** Who may read a page is the `documents` feature's grant and
  this org's RLS, like every other table. A per-page ACL is a second permission system.
- **No co-editing.** A whole-body save is last-write-wins, which is right for the
  documents people actually write here. Real co-editing is CRDTs, a presence channel and
  a different storage model — a rewrite entered deliberately, not a v1 extended into.
- **No version history yet.** `updated_at` and nothing else. Snapshots are cheap to add
  later (a `document_versions` table written by trigger) and expensive to design badly
  now.
- **No block type per industry.** A `/roof-measurement` block would be the first crack.
  Industry specifics are a custom field or a `views` row, as everywhere else.

## A page is a record kind

`document` is in `RECORD_KINDS` with segment `documents`, which buys the list page, its
industry-chosen columns, the ⌘K-reachable terms, the graph node, the generic create/edit
form and the assistant's reach **with no new plumbing**.

Its own screen is an editor rather than the generic record page, which is the documented
escape hatch: a static segment outranks the `[kind=record]` matcher, so
`(app)/documents/[id=guid]/` wins and the generic page stays the default for every other
kind. It earns that for the simplest possible reason — **a document IS its body**, and
the generic page's header-tabs-and-rail has no frame for one. The page has no `pages`
row: its title is the document's name, the record-page exception.

## The body is jsonb; the references are rows

`documents.body` is one `jsonb` column, following `slide_decks.deck_json` and its stated
reason: it is always read, written and versioned as a unit. Rows per block would buy
ordering machinery, a position column, a reorder transaction and a cascade for a thing
that is never read a row at a time.

The envelope is **ours**, not the editor's — `{ version, blocks }`, where `blocks` is
whatever the editor emitted and `version` is this schema's number — so swapping the
editor library is a renderer change rather than a migration. Three checks in the database
guarantee the envelope and no more (`documents_body_is_object` / `_has_version` /
`_has_blocks`; the `?` operator in each is load-bearing, because `jsonb_typeof` of a
missing key is NULL and a check constraint only fails on FALSE).

**Strict in, lenient out.** `documentBodySchema` refuses nonsense on the way in;
`documentBody()` on the way out keeps the blocks that decode and drops the ones that do
not. Losing one paragraph to a version skew beats losing the document.

**References are rows**, because a backlink is the one question you cannot ask of jsonb.
`entity_references` reuses the shared `(crm_entity_type, id)` link on **both** sides
rather than inventing vocabularies of its own — so a note becomes a source later with no
further schema.

It is deliberately not the `relationships` table: a relationship is **curated** (a type
with forward and inverse labels, at most one open per pair, ended rather than deleted so
a handover stays history); a reference is **derived** from text somebody typed, rewritten
wholesale on every save, and means only "this was named here". Derived rows in the
curated table would make the graph noise and fight its uniqueness rule.

## The `@` language

An `@` reference is an anchor in the block's own HTML carrying the pair the whole CRM
shares — the kind and the id, **never a name**, so renaming John Smith does not break the
sentence that named him.

- `mentionAnchor()` writes it and `documentMentions()` reads it, both in
  `$lib/crm/documents.ts`. **They are a matched pair**: write a mention any other way and
  the server stops indexing it, and a backlink goes missing with nothing to notice.
- Editor.js has no trigger-character notion — its inline tools are selection-driven — so
  `$lib/editor/mentions.ts` is the whole of it: `mentionQueryAt()` (pure, offset-based,
  tested without a DOM), `insertMention()`, and `createMentionTool()`.
- **`createMentionTool()` is load-bearing and not a formality.** Editor.js strips every
  tag no tool declared, and it builds that allow-list from the _inline_ tools in play.
  Without it the anchors look right in the DOM and vanish on `save()` — the worst failure
  available.
- The picker is `GET /api/records/search`, the first of CLAUDE.md's endpoint exceptions
  (a JS-triggered read, search-as-you-type). **The gate answers first, kind by kind**, so
  the menu cannot offer — or be used to enumerate — a record the reader could not open.

## Where the writes go

The editor's autosave is a **form action**, not a `fetch`: the mutation is born in a
gesture on the page it lives on, so it goes through a hidden form filled from script and
submitted with `requestSubmit()` — the calendar's drag-to-move road. Notes keep
`/api/notes` because the dock floats over every screen; a document does not inherit that
exemption.

`saveDocument()` in `$lib/server/crm/references.ts` is the **one** place a body and its
index are written together, in that order: the writing lands first, so a failure in the
derived index can never cost somebody their page. Never write `body` through
`updateDocument()` directly.

Naming a page and writing one are different acts: `/documents`'s `create` action is the
generic record form (a title and an emoji), and it never touches the body.

## Backlinks

`listRelatedRecords()` opens with the pages that name the record, **for every kind** —
before the kind-specific groups, so it sits in the same place on every record page. It is
the one group they all have. A kind whose `canOpen()` says no is never fetched.

Deleting a record **detaches** the pages about it and **deletes** the backlinks to it:
the writing stays, the dangling index entry does not.

## Pictures

`document-images` is a **private** bucket, unlike `product-images`: a storefront photo is
meant for anybody and a screenshot of an account's rate sheet is not. The body stores an
app-relative URL (`/api/documents/images/<org>/<uuid>.<ext>`), never a storage URL, so it
never expires, `img-src 'self'` covers it with no new CSP origin, and the read goes
through the caller's own client — the storage policy answers, not code that could forget
to ask. The upload names the file itself; an uploaded filename is the uploader's text.

## Adding to it

- **A block type** is app code only — a tool in the editor component. Never a migration.
- **An embed** writes an `entity_references` row with `kind = 'embed'`, so "what shows
  this view" stays answerable.
- **Templates** are the obvious next thing and the `industry_custom_fields` shape
  exactly: a `document_templates` table plus `industry_document_templates`, copied into
  an org on creation by trigger. That is what turns `/documents` from a blank page into
  the paperwork a vertical actually does.
- **Attaching a page to a record** — `documents.entity_type` / `entity_id` exist and the
  whole read path honours them, but nothing in the UI sets them yet. The natural door is
  a "New page" button on a record page that creates one already attached.
