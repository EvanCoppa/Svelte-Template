# Notes, Documents and Records — the plan

> **Status: a plan, not a description.** Everything in [notes.md](notes.md) is built;
> everything below the "What exists today" section is not. This file is the agreed
> shape, the decisions that were already made, and the order to build in. It becomes
> `docs/documents.md` (and amendments to `notes.md`) as the phases land, and it should
> be deleted when the last one does — a plan that outlives its work turns into folklore.

## The one idea

Three layers, and the whole design is that each one knows about the other two:

| layer         | the question it answers                    | the test                                        |
| ------------- | ------------------------------------------ | ----------------------------------------------- |
| **Notes**     | "I need somewhere to put this right now."  | Would you mind if it vanished in a month?       |
| **Documents** | "I'm working on / writing something down." | Does it have a title someone else would search? |
| **Records**   | "The business tracks this."                | Does anything sum, sort or filter on it?        |

A phone number for ten minutes is a note. An account strategy is a document. A company
is a record. Nothing forces a person to decide which one they are making before they
have finished thinking, and the system's job is to let a thought move down that table
without being retyped.

Notes are built. Records are built — `RECORD_KINDS`, the generic record page, the
generic create form, views. **Documents are the missing middle**, and most of this plan
is them.

## What exists today

Worth reading before designing anything, because roughly half of the original brief is
already shipped under a different name.

| the brief asked for               | the repo already has                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| a sticky-note dock, quick capture | `note-dock.svelte`, `/notes`, autosave, colors, archive — [notes.md](notes.md)        |
| notes attached to what you're on  | `notes.entity_type` + `entity_id`, the shared polymorphic link                        |
| "@ mentions resolve to a record"  | `crm_entity_type` + `private.crm_entity_exists()` + `recordLinks()`                   |
| "live data views inside a page"   | `views` rows, `runView()`, `describeViewRows()`, `pinsFor()` — [views.md](views.md)   |
| "modules register commands"       | the feature registry + `role_permissions` + `ToolAccess` on every AI tool             |
| "cloud AI for expensive work"     | the assistant: `ToolLoopAgent`, tools gated by feature — [assistant.md](assistant.md) |
| a block document stored whole     | `slide_decks.deck_json`, validated by `slideDeckSchema` on save                       |
| "create a record from a command"  | `RECORD_FORMS` + `CreateRecord` + `src/lib/server/records.ts`                         |

What is genuinely new is: the documents table and its editor, the `/ @ ::` input
language, the reference/backlink index, and the on-device intelligence layer.

---

## Decision 1 — it is `documents` in the schema and "Pages" on screen

`public.pages` is taken. It is the route/title registry (the `pages` migration): one row
per screen, keyed by pathname, and it is what titles the browser tab and names a
breadcrumb. A second `pages` table meaning "a document a user wrote" would make every
future sentence in this repo ambiguous, and `page_blocks` next to `pages` is a trap
someone falls into within a month.

So: the table is **`documents`**, the feature id is **`documents`**, the route is
**`/docs`**, and the module is `src/lib/server/crm/documents.ts`.

The user-facing word is not lost, because this repo already has a mechanism for exactly
this: `features.name` / `features.noun` are the default words and `industry_features`
carries an industry's own ([features.md](features.md), and CLAUDE.md's "A feature's row
is where a thing is named"). Ship `name = 'Pages'`, `noun = 'page'` as the default, and a
practice can call them "Chart notes" and a roofer "Job files" with no code change. The
schema stays unambiguous; the screen says whatever the org's industry says.

**Never** put the word "page" in a `documents` identifier, and never add a `title`
constant in `src/` for it — `recordTerms(page.data.terms, 'document')` is the accessor.

## Decision 2 — a document's body is jsonb; its references are rows

The original spec proposed a `page_blocks` table, one row per block. This repo has
already answered that question twice, in opposite directions, and both answers apply
here.

**The body is jsonb**, following `slide_decks.deck_json` and its stated reason: a deck
"is always read, written and versioned as a unit — the editor loads it whole, saves it
whole, and nothing ever queries across slides". A document is the same shape. Rows per
block would buy ordering machinery, a position column, a reorder transaction and a
cascade for a thing that is never accessed a row at a time. Apply the proposals rule
2 test — _would two unrelated industries ever query on it?_ — to a block's innards, and
the answer is no.

```
documents
  id, org_id, created_by, parent_id (self, nullable), title, icon,
  body jsonb not null default '{"version":1,"blocks":[]}',
  archived_at, created_at, updated_at
```

`documentBodySchema` in `src/lib/schemas/documents.ts` validates it on save — the
freeform-content tier of the proposals three-tier rule. The database guarantees only the
envelope (a numeric `version`, an array of `blocks`) via a check constraint, exactly like
`slide_decks`. An unknown block type is the renderer's problem, not a reason to refuse a
save and lose someone's writing.

**References are rows**, because they _are_ queried across documents — that is what a
backlink is, and it is the one thing you cannot do from inside jsonb. So the editor
extracts every `@` reference from the body on save and writes the index (Decision 3).
That split — opaque content in jsonb, the one queried thing lifted out into rows — is
the same call `proposals` makes with `custom_fields` versus
`custom_field_definitions`.

## Decision 3 — references reuse the one polymorphic link

CLAUDE.md: _"One polymorphic link, not one per table."_ The original spec's
`content_references` invented its own `source_type` / `target_type` vocabularies
(`note | page`, `record | page`). That is a second mechanism, and it would drift from
`crm_entity_type` the first time a kind is added.

Instead: **add `note` and `document` to `crm_entity_type`**, and the reference table
becomes ordinary.

```
entity_references
  id, org_id,
  source_type public.crm_entity_type, source_id,   -- the note or document doing the mentioning
  target_type public.crm_entity_type, target_id,   -- what it mentions
  kind public.reference_kind,                      -- mention | embed
  created_at
  unique (org_id, source_type, source_id, target_type, target_id, kind)
```

Adding those two enum values costs **two migrations each**, because Postgres refuses to
use an enum value added in the same transaction — the party-model migration says so and
the notes migration already flagged this exact cost for tagging notes. Budget for it and
do it first, in Phase 0, because everything downstream depends on it.

Three consequences, all of them good:

1. `private.crm_entity_exists()` grows a `note` branch and a `document` branch, and
   `public.on_crm_entity_deleted()` grows one: **delete the references pointing at a
   deleted record.** A dangling backlink is worse than no backlink. Note the asymmetry
   the notes migration already established — the record goes, the _writing_ stays and
   detaches; only the index entry is deleted.
2. **Notes become taggable for free**, which is the top item on notes.md's "deliberately
   not here (yet)" list. Same for addresses and custom fields on a document, if that ever
   matters.
3. Being in `crm_entity_type` does **not** make a document a record page. `proposal_option`
   is in the enum with no list page and no route. A document is opened at `/docs/<id>`
   by its own editor, not by `[kind=record]`, and it is not added to `RECORD_KINDS`.

**Backlinks** are then one query: `select … from entity_references where target = (kind, id)`.
The record page already has a place to render them — the related-records groups fed by
the shared entity link — so "Mentioned in" is a group there, subject to the same rule the
rest of that page follows: `passesFeatureGate()` decides whether a reference is a link or
plain text, so a reader who cannot open `/docs` never gets a live link to one.

## Decision 4 — `/`, `@` and `::` are one registry, and `::` writes nothing

The three-character language is right, and it should be identical in a note, in a
document, and in every future editor:

- **`/` changes content** — insert or transform a block (`/math`, `/list`, `/table`, `/heading`, `/view`).
- **`@` connects** — a reference to a record or a document. Resolves to `(entity_type, entity_id)`, never to a string, so renaming John Smith does not break the sentence.
- **`::` does something** — a business action (`::task`, `::quote`, `::remind`, `::summarize`).

Build them as one client-side registry, `src/lib/editor/commands.ts`, with the same
shape the AI tools use: each command names **the feature it belongs to and the level it
needs**, and the palette filters by the session's `features` + `access` the way
`activeToolNames()` does. That is what makes "industry modules register commands" true
without a plugin system: a command belongs to a feature, a feature belongs to industries
and tiers, and the existing resolver already answers "may this person see this".

**The hard rule: `::` opens an existing form. It never writes.** `::task` reaches
`CreateRecord` with `type="task"` pre-filled from the surrounding text and the current
record (by navigation — see Decision 11); `::quote` links to the proposal builder at
`/proposals/new`; `::remind` opens the calendar's booking form. Every one of those
already validates,
already checks `manage` on its feature server-side, and already toasts. A `::` command
that posts its own mutation would be a second create path for every record kind in the
app, and the first schema change would leave it behind.

This is also what makes the "note initiates a structured action, the note does not become
an order" principle in the brief literally true in code: the note hands values to a form,
a human confirms, the form action writes.

`@` needs one thing that does not exist: a **cross-kind record search endpoint**. That is
a legitimate `+server.ts` (search-as-you-type is the first listed exception in CLAUDE.md's
endpoint rules) — `GET /api/records/search?q=` returning `{ kind, id, label }`, built on
the existing `$lib/server/crm/*` list modules and filtered by `passesFeatureGate()` so
the picker never offers a record the reader could not open.

## Decision 5 — the deterministic layer is pure, tested, and free

`/math` and `/list` are the Antinote inheritance and they must not touch a model.

- `src/lib/editor/compute.ts` — pure: parse lines, resolve variables, evaluate,
  re-evaluate dependents when one changes, format money and units. Vitest beside it,
  like `$lib/notes.ts` and `$lib/calendar.ts`. No `$app/*` imports, so it stays testable
  in node.
- Same for reference parsing and list toggling.

The line to hold across the whole plan: **deterministic code does math, currency, units,
lists, dates, `@` search and command matching. A model never does any of them.** Not for
cost — for correctness, latency and testability. An LLM that gets `25 × 37.50` right 99%
of the time is a worse calculator than a calculator.

## Decision 6 — an embedded view is a `views` row, gate-checked at render

`/view` inserts a block citing an existing `views` row by id. The server resolves it with
`resolveView()`, runs `runView()`, and hands the page `describeViewRows()` output — the
page never learns the source, which is views.md rule 3 and stays true inside a document.

Two constraints that fall straight out of the existing design:

- The reader's own gate decides. A document embedding the `suppliers` view renders that
  view **only when `passesFeatureGate()` passes for the reader**; otherwise the block
  renders as a titled placeholder. A document is shared org-wide; feature access is
  per-session, and the block cannot be allowed to leak rows past a gate.
- **Per-org saved views stay deferred**, exactly as views.md already says. V1 embeds the
  views a migration shipped. When saved views arrive, the block does not change — the id
  it cites just starts resolving to an org-owned row.

The embed also writes an `entity_references` row with `kind = 'embed'`, so "what shows
this view" is answerable.

## Decision 7 — where the writes go

Notes keep `/api/notes`, and notes.md already argues why (cross-page dock, multi-verb,
no form). **Documents do not inherit that exemption.** A document is edited on the page
it lives on, so it is a form action, autosave and all.

The mechanism already exists: the calendar's drag-to-move. A hidden `<form>` bound to a
`superForm` store, filled from script, submitted with `requestSubmit()`
(`src/routes/(app)/calendar/+page.svelte:299`). The document editor accumulates a patch,
debounces it the way `Note.Editor` does (250 ms, plus blur and unmount), fills the hidden
form and submits it. Freshness is a new `QUERY.documents` key.

> **Doc nit to fix while here:** CLAUDE.md's calendar bullet describes the drag as
> `fetch('?/move')` + `deserialize`, but the code and CLAUDE.md's own "Server actions vs
> API endpoints" section both say hidden form + `requestSubmit()`. The code is right;
> the bullet is stale.

## Decision 8 — on-device intelligence has three blockers, and none of them is the model

The autocomplete and dictation layer is the most speculative part of this plan, and the
things most likely to sink it are not model quality. In order:

1. **`Permissions-Policy` currently forbids the microphone.**
   `src/lib/server/security-headers.ts` sends `microphone=()`. Dictation is impossible
   until that becomes `microphone=(self)`, and that is a deliberate weakening of a
   documented header — it belongs in the same PR as the feature, with a comment saying
   why, not slipped in early.
2. **CSP forbids WASM compilation.** `script-src 'self' 'unsafe-inline'` has no
   `'wasm-unsafe-eval'`, and ONNX Runtime (under Transformers.js) needs it even on the
   WebGPU path. `worker-src 'self' blob:` is already correct, so the inference worker
   itself is fine.
3. **Where the weights live.** Fetching them from a model CDN means a new `connect-src`
   origin and a third-party dependency on every first run. **Host the quantized weights
   in Supabase Storage instead** — that origin is already in `connect-src`, derived from
   `PUBLIC_SUPABASE_URL`, so the CSP needs no new origin at all. Cache them in the Cache
   API / IndexedDB keyed by model version.

Then the three-axis rule from [user-preferences.md](user-preferences.md) settles the
settings, and it settles them cleanly:

| the switch                              | axis             | where                                           |
| --------------------------------------- | ---------------- | ----------------------------------------------- |
| does this org have the assistant at all | **organization** | the feature registry                            |
| do I want autocomplete while I type     | **account**      | one `PREFERENCES` entry, `feature: 'assistant'` |
| is the model downloaded on this machine | **device**       | IndexedDB / Cache API — never a preference      |

That last row is the important one: a downloaded model is per-device by definition, and
storing "downloaded: true" in `user_preferences` would promise a model on a laptop that
only exists on a desktop. Cleared site data reads as "not downloaded", which is the
correct answer.

**On the model itself: build the adapter, do not pick the model.** An
`AutocompleteEngine` interface with one Transformers.js implementation, benchmarked on
time-to-first-token, resident memory, download size and completion quality — with an
explicit kill criterion agreed _before_ benchmarking (if p50 time-to-first-suggestion
exceeds ~150 ms on target hardware, ghost text is worse than nothing and the phase ships
disabled). Nothing outside the adapter may know the model's name, and the editor must be
fully usable with the engine absent — it is a browser-only capability behind SSR, so
"absent" is the default state on every first paint.

## Decision 9 — the Context Engine is the assistant's context, one level up

`src/lib/server/ai/context.ts` already exists: a request-scoped bundle of the Supabase
client, the active org with its resolved feature modes, the caller's grants, and the user.
Every AI tool takes it, and `requireToolContext()` re-checks with it.

The "Context Engine" in the brief is the **client** half of the same idea, and it must not
become a second one. One module, `src/lib/editor/context.svelte.ts`, answering
`editorContext()` with what the current screen knows — the current record (kind + id, from
`page.data`), the `@` references already in the text, the current sentence and paragraph,
the document or note being written. It is _cheap_ precisely because we own the app: no
screen scraping, no permission prompt, no guessing.

Rank it, and keep the packet small:

1. current sentence → current paragraph → current note/document
2. current record → explicitly `@`-mentioned records
3. linked records → recent context

Local autocomplete gets tier 1 and the labels from tier 2, and nothing else — a local
model with a small window gains nothing from a wall of CRM rows. Cloud commands
(`::summarize`, `::draft-email`) send the same packet to the **existing agent**, as one
more tool with a `ToolAccess` entry, not as a new endpoint with its own prompt assembly.
That is the whole point of routing both through one context shape: there is one place
that decides what a model is allowed to see, and it is already the place that decides
what a tool is allowed to touch.

## Decision 10 — the note editor stays a textarea, and results live in a gutter

Doing the scratch-paper features first (Phase 1a) forces one question the original
ordering let us dodge: `note-editor.svelte` renders a `<Textarea>`, and **you cannot
render a live math result inline in a textarea.** Three ways out, and the choice matters
more than it looks:

| approach                        | cost                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **a results gutter** (chosen)   | per-line alignment against a wrapping textarea is fiddly                                                                                  |
| write `= $937.50` into the body | poisons `noteLabel()` (a note is named by its first line) and search; machine-edits text under a live caret inside a 250 ms autosave loop |
| swap to `contenteditable`       | drags the largest open question in this plan — which editor library — into its cheapest phase                                             |

**The body is the source of truth and computed output never enters it.** A gutter is
derived, so `noteLabel()`, `noteExcerpt()`, `noteMatches()` and `notesToMarkdown()` keep
working with no changes at all, and a note written on a phone (where the dock is
`hidden md:block` and `/notes` is the whole feature) degrades to plain text rather than
to someone else's markup.

Checklists are the easy case in the same model: `- [ ]` is the text convention, and
clicking the gutter's box rewrites **one character at a known offset**. That is a safe
edit in a way that rewriting whole result lines is not, and it is the only write to the
body the compute layer is allowed to make.

## Decision 11 — `::` navigates, because there is exactly one create-form id

`CREATE_FORM_ID` in `src/lib/server/records.ts` is a single fixed string — "one id for
every create form", so the posted form routes to itself including on the no-JS path. Two
consequences for `::`:

- The dock cannot mount its own `CreateRecord` beside a list page's without a superforms
  id collision, because the dock is mounted by the `(app)` layout and floats over every
  screen.
- Pre-building forms for all seven record kinds in that layout would mean seven
  `superValidate` calls on every page load in the app.

So `::task` **navigates**: `/tasks?new=…`, and the list page opens its own form
pre-filled. `createRecordForm(type, defaults)` already takes defaults and the views
feature already uses exactly that to pin a supplier on "Add from Vendors", so this is
existing machinery, not new. The cost is real and should be stated rather than
discovered: you get moved off the page you were writing on. Keeping the note in place
would need a per-instance form id — a deliberate change to `CREATE_FORM_ID`'s contract,
made on purpose with the no-JS path re-checked, not slipped in.

---

## Phases

Each phase is shippable on its own and has an exit criterion. `check`, `lint`,
`lint:oxlint`, `knip`, `test` and `db:types:check` at zero is assumed throughout and is
not repeated per phase.

**The order is deliberately Antinote-first**, and the reason is not enthusiasm — it is
that the whole scratch-paper layer needs **no migration at all**. `notes.body` is already
`text`, the editor already autosaves, `/api/notes` already takes a body patch, and
`createRecordForm()` already accepts defaults. The paired enum migrations that everything
else in this plan waits on are needed only by the reference index, so they move to the
phase that actually has a document to point at. That keeps the least reversible work
until last, and puts the part people will judge the product by first.

**Phase 1a — the scratch pad.** `src/lib/editor/compute.ts` and the `/` palette, in the
note editor only: `/math` with variables, currency, percentages and reactive recompute;
`/list` checklists; sums, averages, counts. Pure module, vitest beside it, results
rendered in a gutter (Decision 10). No `@`, no `::`, no AI, no schema change, no new
dependency. _Exit: a note totals `price * quantity` as you type, and `noteLabel()`,
`noteExcerpt()`, search and `notesToMarkdown()` are all provably untouched by it._

**Phase 1b — the language.** `@` with `GET /api/records/search` (gate-filtered), the `::`
palette over the command registry, and `::task` / `::quote` / `::remind` handing off to
the forms that already exist. Still no schema change. _Exit: from the dock, on a company
page, `@`-mention a contact and land on a pre-filled task form._

**Phase 2 — the enum.** Two paired migrations adding `note` and `document` to
`crm_entity_type`, plus the branches in `private.crm_entity_exists()` and
`public.on_crm_entity_deleted()`. Nothing user-visible; it exists to unblock Phase 3, and
it lands here rather than first because nothing before it needs it. _Exit: `db:reset`
clean, types regenerated and committed._

**Phase 3 — documents.** The `documents` table, the feature rows (registered exactly as
notes.md describes: `features`, `pages`, `industry_features`, `tier_features`,
`role_permissions` derived from what each role can already do), `/docs`, `/docs/<id>`,
the block editor over jsonb, `entity_references` written on save, nesting via `parent_id`.
The same `src/lib/editor/` from Phases 1a/1b, mounted in a second surface — if it needs
changes to work there, that is the signal it over-fitted to notes. _Exit: a document
mentioning a company shows under "Mentioned in" on that company's record page._

**Phase 4 — promotion and embeds.** `::create-page` turns a note into a document, leaving
the note pointing at it (`entity_references`, `kind = 'mention'` from the note). The
`/view` block. _Exit: a note becomes a document without retyping; a document embeds the
`suppliers` view and renders a placeholder for a reader who lacks the feature._

**Phase 5 — local autocomplete.** The header changes (2 and 3 in Decision 8), weight
hosting, the worker, the adapter, the benchmark, the account preference, ghost text with
Tab / word-by-word Tab / Esc. _Exit: the benchmark table is in the PR, and the kill
criterion was checked before the merge, not after._

**Phase 6 — dictation.** `microphone=(self)`, mic capture, a local speech model through
the same worker layer, into the note editor first. _Exit: a ten-second note dictated with
the network tab empty._

**Phase 7 — cloud commands.** `::summarize`, `::draft`, `::extract` as tools on the
existing agent, each with its `ToolAccess` row and a label in `src/lib/ai/labels.ts`.
Destructive ones go in `TOOL_APPROVAL`. _Exit: no new prompt-assembly code — the diff is
tool files, two map entries each, and labels._

## Deliberately not in this plan

- **Realtime collaborative editing.** A whole-document jsonb save is last-write-wins, and
  that is correct for the documents people actually write here. Genuine co-editing needs
  CRDTs, a presence channel and a different storage model; it is not a v1 that gets
  extended into, it is a rewrite, and it should be entered deliberately or not at all.
- **Document version history.** `updated_at` and nothing else. Snapshots are cheap to add
  later (a `document_versions` table written by trigger) and expensive to design badly now.
- **Per-user private documents.** Documents are org-scoped like notes and everything else
  — `profiles` stays the one exception. The reason notes.md gives applies unchanged: the
  point of writing something down next to a company is that whoever covers for you can
  read it.
- **A block type per industry.** Industry specifics go in a custom field or a `views` row,
  per the rule in CLAUDE.md. A `/roof-measurement` block would be the first crack.
- **`documents` as a `RECORD_KINDS` entry.** It is in `crm_entity_type` so things can point
  at it; it has its own editor route and does not belong on the generic record page.

## Open questions

1. **Does `/docs` ship in every industry, like notes?** Notes did, on the argument that
   every vertical writes things down. Long-form documents are less obviously universal,
   and `industry_features` makes it cheap to be conservative. Recommend: every industry,
   every tier, matching notes — and revisit if a vertical never opens it.
2. **What does the block editor render with?** No editor library is vendored today, and
   this is the single largest dependency decision in the plan. It should go through
   `dependency-scout` before Phase 3 starts, with "we write the editor ourselves over
   `contenteditable`" as a genuine option to price rather than a straw man. Ordering the
   scratch pad first buys real evidence for that call: by then `src/lib/editor/` exists,
   and how awkward the gutter turned out to be is a measurement rather than a guess.
3. **Does a note keep a hard cap of 20 000 characters once `::create-page` exists?** It
   becomes a much easier constraint to defend when there is somewhere to graduate to —
   possibly the prompt to graduate.
4. **Is being moved off the page an acceptable price for `::`?** Decision 11 takes the
   cheap path on the grounds that it reuses machinery that already exists. If it grates
   in Phase 1b, the fix is a per-instance create-form id, and that is worth doing
   properly rather than working around.
