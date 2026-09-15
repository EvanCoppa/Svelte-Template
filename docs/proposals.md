# Proposals: one decision model for every vertical

Every vertical this product serves ends in the same moment: a client looks at a base case
and two to four priced, timed options side by side, and picks one. A dental treatment
plan, a roofing package quote, an architecture design scheme, a CRM sales proposal, a
medical supply order, a plastics tooling-plus-per-unit quote — the nouns differ, the shape
does not. The **`proposals`** entity is that shape, once, and the slides that present it
(the comparison table and the investment summary) render from it with no per-industry
code.

This page is the contract for keeping it that way. The `proposals` migration
(`supabase/migrations/20260906120100_proposals.sql`) is the implementation; the Zod side is
`src/lib/schemas/proposals.ts`.

## The tables

| table                          | one row means                                                          | written by                         |
| ------------------------------ | ---------------------------------------------------------------------- | ---------------------------------- |
| `proposals`                    | a decision offered to one CRM record: title, status, shared terms      | members (delete: owner/admin)      |
| `proposal_options`             | one column of the grid — a priced, timed, financeable choice           | members (delete: owner/admin)      |
| `proposal_line_items`          | an itemised line inside an option; `total` is generated                | members (delete: owner/admin)      |
| `billables`                    | the fee schedule: one chargeable line, priced per unit, with its code  | members (delete: owner/admin)      |
| `quick_plans` + `_billables`   | a named bundle of billables that fills an option in one click          | members (delete: owner/admin)      |
| `custom_field_definitions`     | an org-declared, typed attribute its options carry (a comparison row)  | owner/admin                        |
| `proposal_custom_field_values` | an option's value for one definition, in the column matching its type  | members (delete: owner/admin)      |
| `proposal_events`              | one thing that happened: sent, viewed, option selected, accepted, …    | members as themselves; append-only |
| `execution_records`            | the vertical-specific follow-through on the accepted option            | members (delete: owner/admin)      |
| `slide_decks`                  | the org's one slideshow: which slides, in what order, with what design | members (delete: owner/admin)      |

Everything upstream of the decision is shared. **Only `execution_records` is allowed to
differ per vertical**: its `execution_type` is a fixed set we own, but its `status` is
free text and its `details` are jsonb, because an appointment schedule and a production
run share nothing past "which option, for which proposal".

## Rule 1 — column or jsonb?

**Universal attributes are real typed columns.** Price, fee, discount, duration, financing
terms, currency, validity, status — every vertical has them, and the app filters, sums and
sorts on them. A vertical that lacks one leaves the column null; that is what nullable
columns are for.

**jsonb is the escape hatch, not the default.** Three columns hold what genuinely does not
generalise: `proposals.base_config` (the base case: a diagnosis, a roof's measurements, a
part's geometry), `proposal_options.custom_fields` (what only this vertical's renderer
reads: the procedure list, the pitch, the cavity count) and `execution_records.details`.

The test, every time an attribute comes up:

> Would two unrelated industries ever query on it?

If yes, it is a column — add it by migration, nullable, and it becomes part of the grid
for everyone. If no, it goes in jsonb. "We might filter on it one day" is a yes.

| attribute                    | where           | why                                                                              |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------- |
| price, fee, discount, tax    | columns         | every vertical sums and sorts on money                                           |
| duration (value + unit)      | columns         | every vertical compares "how long"; units differ, not the concept                |
| financing term / APR         | columns         | the investment slide computes a monthly payment from them                        |
| warranty years, support tier | custom field    | org-specific, but shown and compared in the grid → a **definition** (see rule 3) |
| procedure list, roof pitch   | `custom_fields` | one vertical's payload; nothing else reads it                                    |
| mold cavity count            | `custom_fields` | same                                                                             |

### `custom_fields` vs `custom_field_definitions`

Both exist, for different jobs. A **definition** is an org saying "our options have a
_Warranty (years)_ row": it is typed, the value lives in a real column of
`proposal_custom_field_values`, and the grid renders it like any built-in row. The
**`custom_fields` jsonb** is opaque payload for a vertical's own renderer and is never
compared or filtered. When an org wants to _see_ an attribute across options, it is a
definition; when a template just needs to _carry_ something, it is `custom_fields`.

## Rule 2 — the parent is a polymorphic link

`proposals.entity_type` + `entity_id` point at the record the proposal is for. There is
no `patient_id`, `job_id` or `deal_id` column and there never will be: **adding a vertical
must not require a schema change to `proposals`**. The kinds are the CRM records every
vertical attaches to — `company`, `contact`, `deal` — because a dental patient _is_ a
contact and a roofing job _is_ a deal. A new vertical maps its nouns onto those kinds and
touches nothing here.

Postgres cannot express a foreign key over a polymorphic pair, so two triggers stand in
for it, both in the migration:

- `proposals_check_entity` refuses a link to a record that does not exist **in the same
  org** (raised with the foreign-key SQLSTATE, so app code maps it like any FK error).
- `*_crm_entity_deleted` on `companies`, `contacts` and `deals` set the link null when
  the parent is deleted. Detach, not cascade: an accepted proposal is a commercial record,
  the same reasoning as tickets in `crm_core`. Both null is a legal state — an
  unattached draft — and the check constraint forbids a half-set link.

Adding a genuinely new parent kind (a new table) is one enum value plus one `when`
branch in `private.proposal_entity_exists()` and one detach trigger — still never a
column.

This link, along with `presenter_id` and `responsible_id` below, also draws as an
edge on `/graph` — computed at read time from these columns, never written as a
`relationships` row. See docs/relationships.md, "The graph page," for why; don't
"fix" the gap by adding real rows for them.

## Rule 3 — enforce values at the right layer

Three kinds of value, three enforcement points. Put a rule at the wrong tier and it
either cannot be enforced or cannot be changed without a migration.

| kind of value                                                         | enforced by                                 | examples                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **fixed, small sets we own**                                          | a Postgres enum (the `crm_core` convention) | `proposal_status`, `duration_unit`, `proposal_entity_type`, `proposal_event_type`, `execution_type`, `custom_field_value_type`                                                                                                                    |
| **org-definable sets**                                                | a lookup table + foreign key + trigger      | `custom_field_definitions` — a value cannot exist without its definition, must sit in the column its type names, and a `select` value must be one of `allowed_values`; a definition cannot change type or drop a choice while values depend on it |
| **freeform presentational content** (delimited strings inside slides) | Zod in the form action, parsed shape kept   | `comparisonTableSchema`, `investmentLineItemsSchema`                                                                                                                                                                                              |

Alongside those, plain **check constraints** hold the invariants that need no lookup:
money and percentages non-negative and in range, `currency` an ISO 4217 code, a duration's
value and unit set together, exactly one typed value column per custom value, an
`accepted` proposal always naming `selected_option_id`, and every jsonb column an object
(plus `allowed_values` an array of strings).

Zod mirrors the database rules (`proposalInsertSchema`, `proposalUpdateSchema`,
`proposalOptionInsertSchema`, `proposalOptionUpdateSchema`, `proposalLineItemSchema`) so a
form gets a field-level message before the round trip — but the database is the line of
defence, and the schemas never carry a computed column.

## Money is server-owned

`proposal_options.computed_total` is maintained by trigger and `proposal_line_items.total`
is a generated column. Neither is in any column grant, and the `BEFORE` trigger overwrites
whatever a client sends, so client math is never trusted. Line-item changes and edits to
the proposal's `default_fee` / `tax_rate` push the recompute down to every affected option.

The one formula, in `private.proposal_option_total()`, rounding to cents at each step:

```
work     = base_price + Σ line_items.total
discount = discount_amount + round(work × discount_pct / 100)
fee      = coalesce(fee_override, proposals.default_fee, 0)
pre_tax  = greatest(work − discount, 0) + fee
total    = pre_tax + round(pre_tax × proposals.tax_rate / 100)
```

Discounts apply to the work, the fee is added after them, tax applies to everything. If a
vertical needs a different rule, change that function — nothing else knows the formula.

## Tenancy

Every table carries `org_id` with the canonical cascade and RLS from the `organizations`
migration, and every child references its parent through a **composite foreign key**
`(parent_id, org_id)`, the `crm_core` mechanism: a row can never point across tenants, so
`proposal_events` and `execution_records` inherit the proposal's org scope structurally,
without a per-row join in their policies. Two more composite keys keep a proposal honest
about its own options: `selected_option_id` and an execution record's option must be one
of _that_ proposal's options.

Write access follows `crm_core`: working data (proposals, options, lines, values, decks,
execution records) is member-writable and owner/admin-deletable; `custom_field_definitions`
is org configuration and owner/admin-only; `proposal_events` is append-only, logged as
oneself, with no update or delete policy at all (the client-facing view logs through the
service-role client with a null `actor`). Column grants keep `org_id`, authorship, a child's
parent link and every computed column out of the browser's reach.

## One deck per org, and every proposal is presented through it

An org has **one** slideshow (`slide_decks`, `unique (org_id)` since the `org_slides`
migration): how its presentation is put together — which slides, in what order, on which
template, with what design and static copy. It holds **no proposal data**; the proposal's
own figures are injected when it is presented. Nothing points at a deck and no screen
lists or names decks: a proposal is presented _through_ the org's deck, full stop. An org
that has not saved one yet presents through the built-in default deck
(`src/lib/slides/default-deck.ts`), and its first save creates the row — a load never
writes.

The whole slide list lives in one `deck_json` column:

```json
{
	"version": 1,
	"slides": [
		{
			"id": "s1",
			"templateId": "cover",
			"content": {
				"text": { "heading": "A proposal for you" },
				"images": {},
				"colors": { "accentColor": "#2563eb" },
				"styles": {},
				"variables": { "heading": { "sourceField": "proposal.title" } }
			}
		}
	]
}
```

This is not a hole in rule 1. A deck is always read, written and versioned as a
unit — the builder loads it whole and saves it whole, and nothing queries across
slides — so a row per slide would buy ordering and referential machinery for a
document never accessed a row at a time. The rule's own test still decides it: no two
industries will ever query on the innards of a slide.

The database guarantees only the envelope (an object carrying a numeric `version` and
an array of `slides`); `slideDeckSchema` in `src/lib/schemas/decks.ts` guarantees the
slide shapes on save — the freeform-content tier of the three-tier rule above. It
deliberately does **not** check `templateId` against the registry: an unknown template is
skipped by the renderer, not a reason to refuse a save and lose the author's work.

## From proposal to slides

Everything under `src/lib/slides/` sees exactly two things — a deck and a `Presentation`
— and never a table or a session. `src/lib/server/crm/slides.ts` is the one file that
reads the database for it: `getDeck()` / `saveDeck()` for the org's row, and
`loadPresentation()`, which reads one proposal through the existing modules (its options
with their lines, the record it hangs off, the two people's names, each option's custom
field rows) and names it in the industry's words. The two pages call those and nothing
else.

- **The registry** (`registry.ts`) is one entry per template: the component that draws
  it and the slots the builder edits — every text slot with its label, default and
  `kind` (`multiline`, `toggle`, `number`; a plain input when unset), every image slot
  (`accept: 'video'` for a clip), every colour, the typography controls — so the editor
  renders any template from the list and no template has a screen of its own. Every
  template takes the same props: `text`, `images`, `colors`, `styleVars`,
  `presentation`, `option`. The library is **Yes Smile's, ported as it was**
  (`templates/<id>.svelte`, same ids, same look): each component destructures the six
  props and derives the names its markup used, so a saved Yes Smile deck's keys mean the
  same thing here. Three are deliberately not here — `education`, `ai-education` and
  `ai-faq` came from a dental education library and an AI pipeline this template lacks
  — and per-provider variants (a builder feature) are not either: a slot that named the
  provider binds to `responsible.name`. The ones Yes Smile filled "in the background"
  now read the presentation instead: **`v1-pricing`** is `perOption` and prices the
  option it is handed (its lines add up to the treatment total, the stored `total` is
  what the client pays, and the gap is the one discount line where Yes Smile listed
  insurance, courtesy and case fee); **`v1-products`** shows the org's active catalog
  (`presentation.products`, the SKUs typed on the slide picking which) and badges a
  product a line already cites instead of adding it to the plan; **`aftercare-closer`**
  takes its items as typed lines and draws its QR code with `qr.ts`; the video slides
  take a clip and a poster per slot.
- **Expansion** (`expandDeck()` in `present.ts`) — a template marked `perOption` (the
  option slide) is repeated once per `proposal_options` row, in `sort_order`, so the
  author places it once and never edits it again when an option is added. The comparison
  slide draws every option side by side from the same rows: total, duration, financing,
  then one row per custom field definition.
- **Variables** (`slideProps()`) — `content.variables[key].sourceField` is one of the
  paths in `bindings.ts` (`client.name`, `presenter.name`, `proposal.title`, …), resolved
  against the presentation; the authored text, then the template default, stand in when
  the path resolves to nothing, so a deck renders even with no client named. Yes Smile's
  `patient.name` / `doctor.name` / `visit.date` / `visit.id` / `practice.name` are
  `client.name` / `responsible.name` / `proposal.date` / `proposal.id` / `org.name`,
  and the templates that bound them still do.
- **The canvas** is a fixed 1400×850 that `frame.svelte` scales to whatever width it is
  given — the list thumbnail, the picker card, the builder canvas and the presenter's
  stage are all the same frame — and colours are literals the author chose, written into
  inline styles, so a slide prints as authored and never follows the app theme.

**Two pages, both under `/proposals`** so the feature gate covers them with no wiring:

- `/proposals/slides` — the builder (`src/routes/(app)/proposals/slides/`, its `pages`
  row by the `org_slides` migration, `manage` to open). Yes Smile's three panes: slides
  and templates on the left, the deck at reading size in the middle, the selected slide's
  controls on the right, rendered from the registry over a sample presentation. The deck
  is the form — one JSON document posted whole (`dataType: 'json'`, like the proposal
  builder) and validated by `slideBuilderSchema` before `saveDeck()` upserts it. Images
  (and the video slides' clips, up to 50 MB — the `slide_videos` migration) go through
  `POST /api/slides/images` into the public `slides` bucket under the org's folder (the
  body is a file, CLAUDE.md's endpoint exception) and the deck stores the URL.
- `/proposals/<id>/present` — the slideshow (`src/routes/(present)/…`, a bare route group
  with no sidebar; it titles itself from its load, the record-title exception). Load is
  `getDeck()` + `loadPresentation()`; the page expands and renders. Reached from the
  Present button on a proposal's record page; the Slides button on the list opens the
  builder.

## The page, and what it is called

`/proposals` is a feature like any other (`proposals_feature` migration): the list page
is `src/routes/(app)/proposals/`, built exactly like `/deals` on
`src/lib/server/crm/proposals.ts`; `proposal` is a record kind, so a row opens on the
generic record page (status, the record it hangs off, its options' count and
recommended total, validity, fee and tax), and a company, contact or deal page lists
the proposals hanging off it. It ships in every industry and every plan.

**Creating one is a page, not the generic modal.** A proposal is the person it is for,
the two people on it and one to five priced options each made of lines — more than one
row of strings — so the "Add …" button on the list links to the builder at
`/proposals/new` (`src/routes/(app)/proposals/new/`, its own `pages` row by the
`proposal_builder_page` migration), the one kind whose creation is a screen. The builder
is Yes Smile's treatment plan form, class for class, on this model and the template's
primitives (its parts in `src/routes/(app)/proposals/new/components/`; the form is
`$lib/schemas/proposal-builder`):

| the source form                      | here                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| the patient                          | the contact the proposal is for (`entity_type` contact), named by the industry's word |
| the doctor                           | `responsible_id` — a member; "Provider", "Project manager", as the industry says it   |
| the presenter                        | `presenter_id` — a member, the signed-in one by default                               |
| a plan (1–5, "No. Plans")            | a `proposal_options` row, in position order                                           |
| case fee, courtesy %, show financing | `fee_override`, `discount_pct`, `financing_available`                                 |
| a procedure ("Items", "Add by code") | a `proposal_line_items` row citing the schedule (`billable_id`)                       |
| teeth / quadrants / arches           | the line's `detail` (the units as picked or typed) and `quantity` (their count)       |
| quick select                         | `quick_plans`: the bundle's billables replace the option's, products stay             |
| a product with a quantity            | a `proposal_line_items` row citing the catalog (`product_id`)                         |
| notes                                | a note activity logged against the new proposal                                       |
| the two save buttons                 | `redirect_to`: the new record's page, or back to the list                             |

The whole document posts as one JSON form (`dataType: 'json'`, superforms); the action
names the proposal after the contact, writes changed contact details back when the
writer may edit contacts, hands the rest to `createProposalWithOptions()` — one batched
insert per table, a billable line's quantity being `billableQuantity()` of its units
(`src/lib/crm/billables.ts`: "12, 13" is two, "1-3" is three, N/A is one) — and lands
where the button said. Every line keeps the price it was picked at; nothing is re-read
from the schedule or the catalog on save. Totals on screen are `estimateOptionTotal()`
(`src/lib/crm/proposals.ts`), the stored formula replayed as a preview. The look is
Yes Smile's on purpose — literal greys and blues with their dark pairs, quoted once in
the builder's `classes.ts` — the one screen that does not paint from the theme's tokens.

What the source form had and the model does not: before/after photos (no storage),
insurance coverage and the cash-offer toggle (no column), tooth surfaces (dental-only;
`unit_choices` generalises quadrants and arches instead), and the patient's DOB, address
and insurance fields. A title, validity, default fee and tax rate are not asked for
either: the title is the contact's name, the rest stay null until the edit form exists.

It is also the reason names live in the registry (docs/features.md, "Names by
industry"): the nouns differ per vertical while the shape does not, so the feature's
row says "Proposals" / "proposal" and the industry rows say "Quotes" / "quote"
(roofing, medical-supplies) and "Treatment plans" / "treatment plan" (cosmetic,
dentistry). Nothing in the page names it.

## Deliberately not here (yet)

- **Editing a proposal after creation.** The builder writes options and lines once;
  the list and the record page read them, and the form that edits them in place is
  still to build.
- **Sharing a slideshow with the client.** The presenter is a signed-in screen; a
  client-facing link (and the `proposal_events` it would log) is still to build.
- **Auto-logging status changes as events.** The form action that flips `status` writes
  the matching `proposal_events` row; a trigger could take that over if it drifts.
- **Vertical-specific handling of `execution_records`** beyond the table.

## Deviations from the brief, on purpose

The design brief named `organization_id`, `CHECK` lists and `computed_total` as a generated
column. This repo already had answers to each: tenant columns are `org_id`, fixed sets are
enums, and a total that reads other tables cannot be a generated column, so it is a trigger.
The brief's own rule — match the migrations already here — wins over its examples.
