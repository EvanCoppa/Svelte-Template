# Roofing: what the vertical still needs

A roofer's day is not a CRM's day. The record that matters is a **roof on a property**,
the sale is a **quote with options a homeowner picks between**, half the money comes from
an **insurance carrier** rather than the customer, and the work after the signature —
order the material, pull the permit, put a crew on it, pass the inspection, register the
warranty — is longer than the work before it.

This page is the design for making the template serve that. It is written against what is
already in the repo, which matters, because the first finding is that **`roofing` is not a
new industry: it has shipped since the `industry_role_catalog` migration** and has been
filled in steadily since. So this is not "add an industry" (that checklist is the closing
comment of `supabase/migrations/20260906190000_industry_role_catalog.sql`, and nothing here
re-treads it). It is a gap analysis and a phased plan for the vertical that exists.

## What roofing already has

Reference data, all of it shipped by migration and all of it already resolving through
`resolveFeatures()` with no app code that knows the word "roofing":

| axis         | where                                                                   | what roofing gets                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| industry row | `industry_role_catalog`                                                 | `('roofing', 'Roofing')`, re-homed from `construction`                                                                                                               |
| features     | that migration + the derived inserts since                              | companies, contacts, tasks, tickets, staff, components, products, notes, calendar, assistant, assets, proposals, billables, quick-plans, suppliers, invoices, ledger |
| names        | `proposals_feature`, `billables_and_quick_plans`, `industry_vocabulary` | Quotes / quote · Services / service · Packages / package · **Homeowners / homeowner**                                                                                |
| vocabulary   | `industry_vocabulary`                                                   | presenter = **Estimator**, responsible = **Project manager**                                                                                                         |
| nav order    | `industry_feature_order` + `ledger`                                     | Quotes 100, Invoices 150, Ledger 175, Homeowners 200, Companies 300, Suppliers 400, Calendar 500, Tasks 600, Assets 700, Tickets 800                                 |
| roles        | `industry_role_catalog`                                                 | Viewer, Crew Lead, Safety Officer, Project Manager, Operations Director                                                                                              |
| view         | `views`                                                                 | Suppliers (companies where `relationship = 'supplier'`, table + map)                                                                                                 |
| seed         | `seed.sql`                                                              | Ridgeline Roofing (pro) and Northwind Roofing (enterprise), four billables, a Packages bundle, two suppliers with pins, a draft quote                                |

Two `hidden`/override fixtures deliberately hang off roofing and must survive any change
here: Globex's `deals` operator override (a pilot on a feature outside its industry **and**
its tier) and `best-practices`, which roofing does not include at all.

## The seven gaps

### 1. The Estimator role does not exist

`industry_vocabulary` already tells a roofer that the person who presents a quote is an
**Estimator** — and the role ladder has no such rung. The five roles roofing ships are a
site ladder (Crew Lead, Safety Officer) plus the generic three; nobody in the catalog is
the person who actually sells. An org can only hand out "Project Manager", which is
manage-on-everything.

### 2. The site roles cannot see the property, and one cannot see the customer

Grants for the ladder rungs (Viewer `read`, Project Manager `manage`, Operations Director
`delete`) are **derived** — every later migration re-runs the join over `industry_features`
— while a specialist's grants are **listed**, which looks like it should have left Crew Lead
and Safety Officer frozen in September. It mostly did not: later migrations chained their
own derivations off `tasks`, `companies` and `proposals` (calendar from tasks, assistant and
contacts from companies, billables and quick-plans and the ledger pair from proposals, the
views from their source), and the chain carried the specialists along. Checked against a
`db:reset`, a roofing Crew Lead already holds calendar `manage`, notes `manage`, proposals
`read` and the whole money-adjacent read set.

What the chain never reached is `assets`, which derives from `products` — a catalog grant
neither site role has. So **neither of them can open a property**, which is the record the
work is done on. And Safety Officer, alone among the six, has no `contacts` grant at all:
they work the callback queue and cannot open the homeowner the callback is about.

Two rows, not the back-fill this section originally claimed. Worth naming precisely because
the derivation chain is doing more work than it looks like it is, and the next person to
add a specialist should expect that.

### 3. There is no Jobs record

Roofing does not include `deals`, so between an accepted quote and an invoice there is
nothing. A re-roof is a week of production — material ordered, permit pulled, crew booked,
dumpster dropped, inspection passed — and today that lives in whatever tasks somebody
remembers to make.

`deals` is the right table for it (a party, an amount, an assignee, a stage on a board),
renamed for the industry the way `proposals` is renamed to Quotes. See "The Jobs decision"
below, because it is the one fork in this plan that is a product call, not a gap.

### 4. Every org gets the same starter pipeline, whatever its industry

`create_default_pipeline(org)` in the `crm_pipelines` migration hard-codes one board named
"Sales" with the stages of the retired `deal_stage` enum, and the trigger calls it for
every new organization. A roofer's board is not Prospecting → Qualified → Proposal →
Negotiation; it is Lead → Inspection → Estimate → Sold → Scheduled → In production →
Completed. The industry axis stops at the nav and the words; it never reaches the board.

### 5. Insurance is unmodelled

Storm restoration is most of the residential roofing market, and a claim carries a carrier,
a claim number, an adjuster with a phone, a date of loss, a deductible, and an ACV/RCV
split with depreciation withheld until the work is done. None of it has anywhere to go.
It is a genuine second payer against the same job: the homeowner owes the deductible and
the carrier owes the rest.

### 6. Custom fields have no industry axis

`custom_field_definitions.org_id` is `not null` and the table is member-written. That is
correct for what it is — an org's own attributes — but it means **there is no way for an
industry to ship the fields it obviously needs**. A new roofing org starts with an empty
`Custom fields` section and a blank page where "how many squares is this roof" should be.

Every other industry-shaped thing in this codebase has the same shape — a default row plus
an industry's own, null inheriting (`features`/`industry_features` for names, nouns and
order; `terms`/`industry_terms` for vocabulary). Custom fields are the one that stopped at
per-org. The fix follows that precedent exactly; see "The custom fields decision".

### 7. `relationship_types` has no industry axis either

System types ship with `org_id` null and are global; an org's own are owner/admin rows.
There is no `industry_relationship_types`. So "inspected by", "crew on", "sold by",
"adjuster for" can only be added globally (polluting dentistry with roofing words) or
per-org (which means seed fixtures, not a vertical). Lower stakes than 6 — the generic
`assigned_to`, `owns`, `installed_at` and `managed_by` cover most of it — but worth naming
so the next person does not assume the axis exists.

---

## The two decisions

### The Jobs decision

**Recommendation: enable `deals` for roofing, named "Jobs" / "job".**

It costs one `industry_features` row, one rename, a nav position and a default board. It
buys the production half of the business: a record with a party, a value, an assignee, a
stage and a board to drag it across, plus `deals` already being a `crm_entity_type` with a
record page, a create form, activities, tags, addresses, custom fields and relationships.

The cost to be honest about: **it changes the meaning of a seed fixture.** `seed.sql`
currently documents Globex's override as "deals is outside both its industry and its tier";
once roofing includes deals that half stops being true, and the comment has to be rewritten
to the state that remains (outside its _tier_, enabled by an operator — still a valid
override fixture). Roofing's `hidden` fixture survives untouched as `best-practices`.

The alternative — a new `jobs` feature and table — is a `crm_entity_type` value, a table,
`private.crm_entity_exists()` and `on_crm_entity_gone()` branches, a data module, a record
page branch and a create form, to arrive at a table whose columns are `deals`' columns. It
is the wrong trade unless a job needs to coexist with a deal in the same org, which in
roofing it does not: the deal **is** the job, before and after the signature.

### The custom fields decision

**Recommendation: add the industry axis, as a new `industry_custom_fields` table of
templates copied into an org on creation — not as a lookup consulted at read time.**

Three options, and the middle one is right:

| option                             | what it is                                                                                                                          | why not / why                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — seed only                      | put the roofing definitions in `seed.sql` against Ridgeline and Northwind                                                           | they exist only on the local stack; a real roofing org still starts blank. Fine as a fixture, not as an answer                                                                                                                                                                                                                                         |
| **B — templates, copied** (chosen) | `industry_custom_fields` reference rows, copied into `custom_field_definitions` by a trigger on org creation and on industry change | follows the `tiers`/`features` precedent: reference data by migration, readable by all, written by migrations only. The org **owns** its copies — it can rename, reorder, add and delete them, which is what an org will want on day two. `custom_field_values` keeps pointing at a real `custom_field_definitions` row, so nothing downstream changes |
| C — resolved at read               | definitions resolve industry rows + org rows at query time, null inheriting                                                         | matches the names/order precedent most literally, but a value has to reference a definition id, and an industry row is not an org's row. It would need the value table to carry a nullable pair, which is a real complication for no benefit an org would notice                                                                                       |

B is one migration (the table, its RLS, the copy in `handle_new_organization`, and a
back-fill for existing orgs) and no app change at all: by the time any load runs, the rows
are ordinary `custom_field_definitions`.

---

## The custom fields roofing needs

These are the templates for option B (and the `seed.sql` fixtures under option A). Grouped
by the `entity_type` they declare — a definition declares its kind, and a value references
`(field_definition_id, entity_type)`, so a homeowner's field cannot be filled in on a quote.

### `contact` — the homeowner

| key                 | label              | type    | values                                                                             |
| ------------------- | ------------------ | ------- | ---------------------------------------------------------------------------------- |
| `preferred_channel` | Preferred channel  | select  | call, text, email                                                                  |
| `best_time`         | Best time to reach | select  | morning, afternoon, evening, weekend                                               |
| `referral_source`   | How they found us  | select  | door knock, storm canvass, referral, web, Google, Angi, yard sign, repeat customer |
| `gate_code`         | Gate code          | text    |                                                                                    |
| `dog_on_property`   | Dog on property    | boolean |                                                                                    |
| `hoa_name`          | HOA                | text    |                                                                                    |

### `asset` — the property

The roof and the house it is on. `assets` holds only universal columns by rule
(`docs/relationships.md`), which is exactly why every measurement below is a custom field
and not a column; the address is the entity link's, and who owns it is a relationship.

| key                     | label                 | type    | values                                                                            |
| ----------------------- | --------------------- | ------- | --------------------------------------------------------------------------------- |
| `roof_squares`          | Squares               | numeric |                                                                                   |
| `roof_pitch`            | Pitch                 | select  | flat, 3/12, 4/12, 6/12, 8/12, 10/12, 12/12+                                       |
| `stories`               | Stories               | numeric |                                                                                   |
| `existing_layers`       | Existing layers       | numeric |                                                                                   |
| `existing_material`     | Existing material     | select  | 3-tab, architectural, wood shake, tile, metal, slate, TPO, EPDM, modified bitumen |
| `decking_type`          | Decking               | select  | OSB, plywood, plank / skip sheathing                                              |
| `roof_age_years`        | Roof age (years)      | numeric |                                                                                   |
| `year_built`            | Year built            | numeric |                                                                                   |
| `satellite_report_url`  | Measurement report    | text    | EagleView / Hover link                                                            |
| `permit_jurisdiction`   | Permit jurisdiction   | text    |                                                                                   |
| `access_notes`          | Access notes          | text    |                                                                                   |
| `hoa_approval_required` | HOA approval required | boolean |                                                                                   |

### `deal` — the job (only if the Jobs decision lands)

| key                       | label                   | type    | values                                                                             |
| ------------------------- | ----------------------- | ------- | ---------------------------------------------------------------------------------- |
| `job_type`                | Job type                | select  | full replacement, repair, inspection, maintenance, gutters, siding, emergency tarp |
| `lead_source`             | Lead source             | select  | (as `referral_source` above)                                                       |
| `permit_number`           | Permit number           | text    |                                                                                    |
| `permit_status`           | Permit status           | select  | not required, applied, issued, inspected, closed                                   |
| `material_delivery_date`  | Material delivery       | date    |                                                                                    |
| `dumpster_ordered`        | Dumpster ordered        | boolean |                                                                                    |
| `final_inspection_passed` | Final inspection passed | boolean |                                                                                    |

**The insurance block**, on the same kind. Eleven fields is a lot for a custom-field panel,
and that is the argument for Claims being a feature of its own later (below) — but as
fields they are shippable this week and they are where the data actually is:

| key                     | label                 | type    | values                                                           |
| ----------------------- | --------------------- | ------- | ---------------------------------------------------------------- |
| `claim_status`          | Claim status          | select  | not a claim, filed, inspected, approved, denied, appealing, paid |
| `insurance_carrier`     | Carrier               | text    |                                                                  |
| `claim_number`          | Claim number          | text    |                                                                  |
| `adjuster_name`         | Adjuster              | text    |                                                                  |
| `adjuster_phone`        | Adjuster phone        | text    |                                                                  |
| `date_of_loss`          | Date of loss          | date    |                                                                  |
| `deductible`            | Deductible            | numeric |                                                                  |
| `acv_amount`            | ACV                   | numeric |                                                                  |
| `rcv_amount`            | RCV                   | numeric |                                                                  |
| `depreciation_withheld` | Depreciation withheld | numeric |                                                                  |
| `supplement_status`     | Supplement            | select  | none, submitted, approved, denied                                |

### `proposal_option` — the quote option

This is the kind the comparison table already renders, and it is where a roofer's options
actually differ from each other: same roof, three shingles, three warranties.

| key                          | label                        | type    | values                                                    |
| ---------------------------- | ---------------------------- | ------- | --------------------------------------------------------- |
| `shingle_brand`              | Shingle brand                | select  | GAF, Owens Corning, CertainTeed, Malarkey, TAMKO, Atlas   |
| `shingle_line`               | Shingle line                 | text    |                                                           |
| `shingle_color`              | Color                        | text    |                                                           |
| `manufacturer_warranty`      | Manufacturer warranty        | select  | standard, System Plus, Golden Pledge, Platinum, Integrity |
| `workmanship_warranty_years` | Workmanship warranty (years) | numeric |                                                           |
| `ventilation_type`           | Ventilation                  | select  | ridge vent, box vents, turbine, power vent, none          |
| `tear_off_layers`            | Layers torn off              | numeric |                                                           |
| `decking_sheets_included`    | Decking sheets included      | numeric |                                                           |
| `includes_gutters`           | Gutters included             | boolean |                                                           |

### `company` — the commercial account, GC or supplier

| key              | label          | type    | values                      |
| ---------------- | -------------- | ------- | --------------------------- |
| `license_number` | License number | text    |                             |
| `coi_expires`    | COI expires    | date    |                             |
| `w9_on_file`     | W-9 on file    | boolean |                             |
| `account_terms`  | Terms          | select  | COD, net 15, net 30, net 60 |

### `ticket` — the callback

| key               | label          | type    | values                                                          |
| ----------------- | -------------- | ------- | --------------------------------------------------------------- |
| `callback_reason` | Reason         | select  | leak, missing shingle, flashing, gutter, cosmetic, storm damage |
| `under_warranty`  | Under warranty | boolean |                                                                 |
| `warranty_type`   | Warranty type  | select  | workmanship, manufacturer, none                                 |

---

## The features and pages to add

Ordered by cost, which happens to be roughly inverse to how much new code each needs.

### Already built at the data layer — they need a feature row and a page

Three table families shipped with no `features` row, no `pages` row and no route, so they
are invisible: `purchases` + `purchase_line_items`, `orders` + `order_line_items`, and
`shipments` + `shipment_line_items` + `shipment_events`. For a roofer these are not
nice-to-haves; ordering material and getting it dropped on the right driveway on the right
morning is the job.

| feature     | route        | roofing calls it                     | what it is                                                                 |
| ----------- | ------------ | ------------------------------------ | -------------------------------------------------------------------------- |
| `purchases` | `/purchases` | **Material orders** / material order | what you bought from a supplier, by line, against a job                    |
| `shipments` | `/shipments` | **Deliveries** / delivery            | a drop at a site, with its events                                          |
| `orders`    | `/orders`    | (inherit)                            | the distributor-shaped sell-side record; roofing probably leaves it hidden |

Each is: a `features` row, a `pages` row, `industry_features` rows for the verticals that
get it, `tier_features`, role grants, a `src/lib/server/crm/` module, a list page built as
"page header, toolbar, table", a `RECORD_KINDS` entry and a `getRecord()` branch.

### One row of reference data, no code

| feature         | what                                                                               | why                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homeowner-map` | a `views` row: contacts with no company, `layouts {map,table}`, opening on the map | exactly `patient-map` with a roofer's word on it. A roofer plans a route; this is the page that lets them. One migration, zero code — the `views` migration's own closing checklist |

Roofing's nav order then wants re-numbering as one statement (the `industry_feature_order`
rule: set every row in the section, not just the newcomer):

```
Jobs 100 · Quotes 200 · Invoices 300 · Ledger 350 · Homeowners 400 · Homeowner map 450
Companies 500 · Suppliers 550 · Material orders 600 · Deliveries 650 · Calendar 700
Tasks 800 · Properties 900 · Tickets 1000
```

### Renames, not features

| feature    | roofing's word                                                                            | note                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets`   | **Properties** / property                                                                 | a one-row `industry_features` update. Worth flagging the tension: `assets` is documented as "the things you own, use, lease or track", and a customer's roof is none of those. The rename is cheap and reads right in the sidebar; if properties ever need columns assets should not have, that is when it becomes its own kind |
| `deals`    | **Jobs** / job                                                                            | the Jobs decision above                                                                                                                                                                                                                                                                                                         |
| `tickets`  | **Callbacks** / callback                                                                  | what a roofer calls a warranty visit                                                                                                                                                                                                                                                                                            |
| `calendar` | **Schedule** / job (the calendar migration already names dentistry and cosmetic this way) | a roofing calendar is crews on sites, not appointments — "Schedule" fits, the noun probably stays `event`                                                                                                                                                                                                                       |

### Worth building, once the above is in

| feature      | route         | what it is                                                                                                                                                      | why it is not phase 1                                                                                                                                                                                                                                          |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claims`     | `/claims`     | the insurance claim as its own record: carrier, claim number, adjuster, date of loss, the ACV/RCV/depreciation split, supplement history, and a link to the job | the eleven custom fields above carry it first. Promote it when a claim needs its own lifecycle and its own money against the ledger — and note that the ledger's party model already handles a second payer, because an invoice names a company _or_ a contact |
| `warranties` | `/warranties` | one row per completed job: workmanship years, manufacturer program, registration number, expiry — the thing a callback is checked against                       | needs Jobs to hang off first                                                                                                                                                                                                                                   |
| `permits`    | —             | do **not** build this. A permit is a task with a due date and four custom fields on the job                                                                     | listed so it is deliberately not built                                                                                                                                                                                                                         |
| crews        | —             | do **not** build this either. A crew is members related to a job through the graph (`docs/tasks.md`, "assignment is a relationship")                            | same                                                                                                                                                                                                                                                           |
| job photos   | —             | `entity_images` already exists and is entity-linked; a job's gallery is a card on the record page, not a feature                                                | same                                                                                                                                                                                                                                                           |

### Not a page: things that are already handled

Financing is already columns on `proposal_options` (`financing_available`,
`financing_term_months`, `financing_apr`) — roofing sells on monthly payment and the
builder already supports it. Measurements are custom fields plus a link. Before/after
photos are `entity_images`. Production stages are the pipeline board. None of these needs
anything new.

---

## The phases

**Phase 1 — `roofing_industry_depth` (one migration, one line of TypeScript).** The
Estimator role and its grants; the two site-role rows from gap 2; the `homeowner-map` view
(plus its id in `FEATURE_IDS`); the `assets` → Properties and `tickets` → Callbacks
renames; roofing's re-numbered nav order. Proven by `npm run db:reset`.

**Phase 2 — Jobs.** `deals` into roofing's `industry_features` named Jobs, an
industry-aware `create_default_pipeline()` with a roofing board, the seed comment on
Globex's override rewritten, and the job custom fields.

**Phase 3 — industry custom fields. Shipped** (`20260911160000_industry_custom_fields.sql`).
The `industry_custom_fields` table, `apply_industry_custom_fields()`, a trigger on org
creation **and** on an org's industry changing, the back-fill, and all 52 roofing rows
above. `custom_field_definitions` gained a nullable `sort_order` so a shipped set keeps the
order it was shipped in — `listCustomFields()` orders by it and falls back to label, which
is the only app change. Two things worth knowing: there is **no `date` value type** (the
enum is text / numeric / boolean / select), so the date fields above ship as `text` until a
`date` type earns its own change; and a copy an org deletes comes back the next time a
migration runs the back-fill, which the migration's closing comment explains and bounds.

**Phase 4 — the material chain.** `purchases` and `shipments` as features: rows, routes,
data modules, list pages, record-page branches.

**Phase 5 — claims and warranties**, if the fields prove they have outgrown being fields.
