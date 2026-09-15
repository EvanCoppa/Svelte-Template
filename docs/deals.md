# Deals

A deal is a piece of business you are working towards: a title, a figure, the day it
is meant to close, the party it is with, and — the reason the record exists — where
it has got to. That last one is a row, not an enum: `/deals` is the worked example of
a **board whose columns are org data**, where `/tasks` is the example of one whose
columns are a fixed vocabulary.

## The funnel is the pipeline

| What                | Where it lives                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| the deal            | `public.deals` — title, `amount`, `expected_close_date`, `assigned_to`       |
| where it has got to | `pipeline_id` + `stage_id` into `public.pipeline_stages`, never an enum      |
| the board it is on  | `public.pipelines`; every org gets a default one by trigger                  |
| who it is with      | `company_id` and `contact_id`, both nullable, as every party-bearing row has |

Data access is `src/lib/server/crm/deals.ts` and `src/lib/server/crm/pipelines.ts`;
the pure questions the browser asks — which column a deal is in, how full a stage's
ring is, what a column adds up to, how its close date reads — are
`src/lib/crm/deals.ts`, the mirror of `src/lib/crm/tasks.ts`.

## One column per open stage, unless grouped — and one Closed column

A `Kanban.Column` is a status group and the `statuses` under it are the states a
record is in (CLAUDE.md, "A board is `Kanban`"). For an open stage the two default
to coinciding: a stage IS the state a deal is in, so an ungrouped one gets a column
of its own and a release lands straight away. Every stage whose outcome closes the
deal — `won`, `lost`, and any more an org adds — shares one `Closed` column
instead, split into a drop zone per stage exactly the way the task board's grouped
columns work: a card dragged there is asked which outcome it landed on, rather than
the funnel growing a column per terminal stage. `buildDealColumns()`
(`$lib/crm/deals.ts`) is the one place that groups them; the page only renders what
it returns.

A wide funnel earns the same treatment among its OPEN stages: `pipeline_stage_groups`
(the `pipeline_stage_groups` migration) is one row per visual column several open
stages share — the deal board's answer to the task board's `TASK_STATUS_GROUPS`, as
rows rather than a JS constant, because a pipeline's stages are rows too (org-definable
sets are rows, CLAUDE.md). A `pipeline_stages` row points at its group with
`group_id`; null (the default every stage has always had) is a column of its own.
`buildDealColumns()` folds stages sharing a `group_id` into one column the same
`Kanban.Zones` way the Closed column already works — a group is never a deal's
status, only ever a way the board is read, and dropping a card on a grouped
column's zone still writes the one real stage it landed on. Merchant services'
ten-stage funnel (`industry_pipeline_stages.group_label`, seeded per industry —
see below) is the worked example: eight open stages become three columns
(Prospecting, Qualification, Underwriting) rather than eight, so the whole funnel
draws in four columns total including Closed. There is no settings screen to shape
groups yet, matching pipelines/pipeline_stages themselves — an org's own board is
grouped by hand today, the way its stages are.

What the columns look like is the stage's own data, not a palette the page keeps:
`STAGE_OUTCOME_TONE` (open / won / lost) is the hue, and the stage's `probability`
is how full its `Kanban.Ring` is drawn — so the rings fill up across the funnel
instead of three hues repeating, and the two ends are the words a fraction cannot
say (`won` is done, `lost` is stopped). The Closed column's own header wears its
first stage's hue and ring, the same simplification the task board's grouped
headers make. A column's header carries its count and what it is worth, which is
the reason a funnel is drawn rather than listed.

A funnel draws **one board at a time**, because a stage only means something inside
its own pipeline. Which one is in the query string — resolved in the load, never
trusted from it — the way the ledger's account filter is, so a link to a funnel is a
link to that funnel. The picker only appears when the org has a second board.

## The move

Dropping a card, or carrying it with the arrow keys, posts the page's `move` action
through a hidden form filled from the script: a gesture has no form of its own, and
this is the road the calendar's drag-to-move and the staff page's hold-to-remove
take (CLAUDE.md, "Server actions vs API endpoints"). So a drag hits the same feature
gate, the same `manage` grant and the same RLS as a typed-in form, and a refusal
comes back as a `message()` the page toasts. Without `manage` the board is frozen
rather than offering a drag that would come back a 403.

What is posted is a **stage**, and `dealPlacement()` looks its board up server-side:
the two ids always move together, and because `listPipelines` reads through RLS, a
stage id that is not this org's is simply not in the list — the lookup is the
authorization check. A card held in a stage it has just been dropped on is drawn
optimistically until `QUERY.deals` comes back.

Everything else about a deal — its title, its figure, its party, and its stage as a
field — is the generic record form's (CLAUDE.md, "Creating and editing a record is
one form"). The board offers the one edit that is a gesture, and no second form.

## The two views

The page is the heading, then a board or the list, remembered per device
(`deals.view`, `$lib/list-view.svelte`) exactly as `/tasks` remembers its two. The
list is the ordinary list page — `DataTable` over the fields the org's industry put
on it (docs/lists.md) — and the rows behind both are read **once** in the load: the
list describes them for its fields through `loadList()`, the board reads the columns
themselves.

## Adding a board to another kind

1. The columns must be a set the org can define, or a fixed enum — decide which
   (CLAUDE.md, "Org-definable sets are rows"). Rows mean a column per row, as here.
2. A pure module beside `src/lib/crm/deals.ts` for what a column holds and what it
   is called; no grouping, counting or wording in the page.
3. One `move` action with its own schema, a hidden form, and a `pending` map for the
   card in flight.
4. Freeze the board on the `manage` grant; the action still re-checks it.
