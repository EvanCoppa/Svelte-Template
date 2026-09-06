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

| table                          | one row means                                                         | written by                         |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------- |
| `proposals`                    | a decision offered to one client record: title, status, shared terms  | members (delete: owner/admin)      |
| `proposal_options`             | one column of the grid — a priced, timed, financeable choice          | members (delete: owner/admin)      |
| `proposal_line_items`          | an itemised line inside an option; `total` is generated               | members (delete: owner/admin)      |
| `custom_field_definitions`     | an org-declared, typed attribute its options carry (a comparison row) | owner/admin                        |
| `proposal_custom_field_values` | an option's value for one definition, in the column matching its type | members (delete: owner/admin)      |
| `proposal_decks`               | a slide deck built for a proposal (join rows, never edited)           | members (delete: owner/admin)      |
| `proposal_events`              | one thing that happened: sent, viewed, option selected, accepted, …   | members as themselves; append-only |
| `execution_records`            | the vertical-specific follow-through on the accepted option           | members (delete: owner/admin)      |
| `slide_decks`                  | the deck itself (its slide content model arrives with the builder)    | members (delete: owner/admin)      |

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
vertical attaches to — `client`, `contact`, `deal` — because a dental patient _is_ a
client and a roofing job _is_ a deal. A new vertical maps its nouns onto those kinds and
touches nothing here.

Postgres cannot express a foreign key over a polymorphic pair, so two triggers stand in
for it, both in the migration:

- `proposals_check_entity` refuses a link to a record that does not exist **in the same
  org** (raised with the foreign-key SQLSTATE, so app code maps it like any FK error).
- `*_detach_proposals` on `clients`, `client_contacts` and `deals` set the link null when
  the parent is deleted. Detach, not cascade: an accepted proposal is a commercial record,
  the same reasoning as tickets in `crm_core`. Both null is a legal state — an
  unattached draft — and the check constraint forbids a half-set link.

Adding a genuinely new parent kind (a new table) is one enum value plus one `when`
branch in `private.proposal_entity_exists()` and one detach trigger — still never a
column.

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

## From options to slides

The grid is `proposal_options` ordered by `sort_order`: one column per option
(`is_recommended` marks the highlighted one), rows for the built-in attributes
(`computed_total`, duration, financing) followed by one row per custom field definition,
values from `proposal_custom_field_values`. No industry branch is needed to draw it.

Where a template takes its content as a delimited string — the comparison table's
`Feature | Basic | Standard* | Premium` lines and the investment summary's
`label|amount` lines — the form action validates the string with the Zod parsers and keeps
the **parsed shape**: rows have exactly the header's cell count, a numeric row holds only
numbers (dashes and blanks read as "not offered"), the recommended column is a single
`*`-suffixed header cell, and yes/no cells come from the known sets the slide draws as
icons. A template never meets a string it has to guess at.

## Deliberately not here (yet)

- **A `proposals` feature and page.** The registry gates pages by existing; register the
  feature (rows in `features`, `industry_features`, `tier_features`, its id in
  `FEATURE_IDS`) in the migration that adds the route.
- **Generating a deck from a proposal.** `proposal_decks` is only the link.
- **Auto-logging status changes as events.** The form action that flips `status` writes
  the matching `proposal_events` row; a trigger could take that over if it drifts.
- **Vertical-specific handling of `execution_records`** beyond the table.

## Deviations from the brief, on purpose

The design brief named `organization_id`, `CHECK` lists and `computed_total` as a generated
column. This repo already had answers to each: tenant columns are `org_id`, fixed sets are
enums, and a total that reads other tables cannot be a generated column, so it is a trigger.
The brief's own rule — match the migrations already here — wins over its examples.
