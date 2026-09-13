# Real estate: designing the rental-portfolio vertical

The customer is a **small landlord operating company** — Biuso Holdings LLC, two duplexes,
five rentable units, 81 transactions over eight months. They own the buildings, they fix
the buildings, they collect the rent, and once a year they hand a pile of numbers to a CPA.
Their whole system today is one Excel workbook (`Portfolio Tracker PRO v2.2`), and reading
it tells you precisely what the product has to be.

**Every other vertical we serve ends at a sale. This one ends at a _report_.** A roofer's
product is the roof; an ISO's product is the annuity; this customer's product, as far as
software is concerned, is a Schedule E-style category rollup with the words "for the CPA"
written on the tab. The workbook's dashboard, its two monthly P&Ls, its annual summary and
its depreciation sheet all exist to produce that one artifact. Nothing else in the file has
a reader.

That is the design constraint, and it inverts our usual one. We normally build the pipeline
first and the money last. Here the money **is** the pipeline, and a version of this product
with beautiful property records and no chart of accounts would be worth nothing to them.

This document is the design: what they get from the registry as it stands, what they do not
get, the one large modeling decision, what has to be built, and which questions we cannot
answer for them. Questions are numbered and carried into
`docs/discovery/real-estate-discovery.html` when that goes out.

Proposed industry id: **`real-estate`**, name "Real Estate". Role ids follow the catalog's
scheme (`b0000000-0000-0000-00II-0000000000RR`); crm..beverage hold `0001`–`0006` and
merchant-services took `0007`, so this vertical is **`0008`**.

## What the workbook actually contains

Worth stating as measured facts, because several of them change the design.

| fact                                                                            | why it matters                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 81 transactions, 2026-02-01 → 2026-09-18, 2 properties, 5 unit values           | Volume is tiny. Manual entry is fine; **bank feeds are not the product**.  |
| 33 rent entries, of which **14 ($16,098.25, 42% of rent) are platform payouts** | airbnb / VRBO / Furnished Finder. Two revenue shapes, not one.             |
| **$32,333.02 of "operating expenses" is Mortgage P&I — 77% of the total**       | Schedule E deducts interest only. The headline number is not a tax number. |
| Two rows dated **2031**-04-01 (typo for 2026), worth $365.10                    | Silently excluded from every report. Today's totals are wrong.             |
| Payment Method: **0 of 81 filled**                                              | A field nobody uses. Don't rebuild it by reflex.                           |
| `CapEx_Depreciation`: 300 formula rows, **0 assets entered**                    | Depreciation reads $0 against $1,025.43 of capitalised spend.              |
| Vendors are freeform: `RGE`/`RGe`, `Town of Victor`/`Village of victor`         | Needs an entity, not a text box.                                           |
| `Rent Roll` has 3 rows for 5 units; Victoria S pays rent with no lease          | The roll and the cash disagree and nothing notices.                        |
| Everything filters on `Setup!B3 = 2026`                                         | Rolling to 2027 breaks the file.                                           |
| `Materials List` empty, `Vacancy Loss` and `Internet` always zero               | Aspirational rows. Do not port them.                                       |

Two more that are only visible if you look at the dates against today (2026-09-12):

- **Dave Willis's lease ended 2026-09-07 — five days ago.** He is holding over. He also
  paid **$1,200** on 2026-09-01 against a $900 roll rent, so somebody renegotiated and the
  rent roll never heard about it.
- **Dale Hess's lease ends 2026-09-30 — in eighteen days.** Nothing in the file says so.

Those two are the single best demonstration of what an application does that a spreadsheet
cannot, and they cost one query.

## The one large modeling decision: properties are their own table

**This reverses the design's first answer, and the reversal is the interesting part.**

The original proposal was that a property and a unit both be `assets` rows, told apart by
`asset_type` and joined by the shipped `part_of` type — no new table, no new
`crm_entity_type`. That was the right call for the customer as read off the workbook: one
landlord, two duplexes, five doors, where unit attributes are things you glance at rather
than sort by. The section stated what would flip it: _if unit attributes turn out to be
things they sort, filter and report on every day, or if they operate enough doors that a
unit list is the primary screen._

Both are true of a property-**management** product, which is what this became. So
`properties` and `leases` are real tables (the `properties_and_leases` migration), and
`assets` goes back to meaning what it was built for — the dishwasher, the boiler, the mower.
That is a better fit than the one it was standing in for, and the vertical keeps it as
**Equipment**.

### One table for buildings and units

A duplex has two rentable units and one mortgage. Utilities are per unit, the mortgage is
per building, and a report has to add them up together — so the two levels cannot be
unrelated rows, and they are alike enough (a name, an address, a status, a value) that two
tables would be the same columns twice.

A unit is therefore a `properties` row with `parent_id` set:

```
Rowan Street Duplex          parent_id null     the building
  └ Rowan Street — Unit 1    parent_id → Rowan  the rentable thing
  └ Rowan Street — Unit 2    parent_id → Rowan
Larkspur Court               parent_id null     a single-family: BOTH
```

Three things fall out of that, and they are why it is one table and not three:

- **A single-family is one row** that is its own rentable unit, with no ceremony.
- **Anything pointing at "a property" needs one column**, not a nullable property/unit
  pair — so the workbook's "Shared" bucket (mortgage, water, lawn) is simply the parent
  row, and a transaction will name whichever level the cost belongs to.
- **Depth is capped at two** by `private.properties_enforce_depth()`, which is what keeps
  it cheap: the building a row rolls up to is `coalesce(parent_id, id)` — a plain
  expression, no recursive CTE, no denormalised root column to keep true. A
  complex → building → unit hierarchy is a later migration; until someone needs it, each
  building is a top-level property and nothing is paid for in advance.

The cap is enforced in both directions and both are tested: a unit may not be parented to a
unit, and a building that already has units may not become one.

### A lease has no status column

Whether a lease is upcoming, running or finished is a question about _today_, and today is a
wall-clock word — the rule the ledger's "overdue" and the task board's "today" already
follow. `starts_on` and `ends_on` are the truth, ending a lease early moves `ends_on` to the
day it actually ended, and `leaseStateOn()` (`$lib/crm/leases.ts`, client-safe) answers the
question in the browser with the viewer's own date. A status column would be a second copy
needing a trigger to stay honest, and it would be wrong at midnight.

`ends_on` is **inclusive** — the last day the tenancy covers — deliberately unlike
`calendar_events.ends_at`, an exclusive instant. Different things: an event is a block of
time, a lease is a set of days a human names. A null `ends_on` is month-to-month, which is
also what a holdover becomes.

Overlapping leases on one property are **allowed** on purpose: two roommates each holding
their own lease on the same unit is a real arrangement.

### What it bought, beyond the obvious

- **Beds, baths, square feet and market rent are columns**, so a new org gets them. Under
  the assets model they had to be per-org custom field definitions — the same gap
  merchant-services hit with MID/MCC.
- **A property has an address.** `addresses` was pinned to parties, which is why the
  assets-shaped portfolio had no address and therefore no map pin and no geocoding. The
  migration widens that constraint by replacing it, which is what its own comment says to
  do. A unit may carry its own address too — "Unit 2" at the same street is how a mailing
  address actually works.
- **A property has photos**, via the same widening of `entity_images`.

That last pair came with a lesson worth recording: **the same rule was written in three
places** — the database constraint, a predicate in the record page's load, and a hardcoded
kind check in its markup. Widening the constraint alone left the address card silently
undrawn. The load now ships `hasAddresses` / `hasImages` and the page renders on those, so
the rule lives in one place on each side of the wire.

## What they get from what exists

| feature                | in? | called here                           | why                                                                                                              |
| ---------------------- | --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `properties` **(new)** | yes | **Properties** / property             | A table of its own, per the decision above. A unit is a row with a parent.                                       |
| `leases` **(new)**     | yes | **Leases** / lease                    | The rent roll. Also what makes the LTR/STR split fall out with no second table.                                  |
| `assets`               | yes | **Equipment** / equipment item        | Back to what it was built for: the dishwasher, the boiler, the mower. `located_at` says which unit one sits in.  |
| `contacts`             | yes | **Tenants** / tenant ⚠️               | A tenant is a person with no company — exactly the party model's homeowner case. Q4.                             |
| `companies`            | yes | **Vendors** / vendor ⚠️               | RGE, MCWA, Home Depot, FFCU, the plumbers. `relationship` splits supplier from partner (airbnb) from lender. Q5. |
| `suppliers` **(view)** | yes | folds into **Vendors**                | Already shipped: a company view filtered `relationship in (supplier)`. Costs nothing.                            |
| `tickets`              | yes | **Maintenance requests** / request ⚠️ | Leak, plumbing repair, boiler. Already has a thread, a priority, an assignee and a party link. Q6.               |
| `tasks`                | yes | Tasks                                 | Turnover checklists, the lease-renewal chase. Board + due-date buckets already exist.                            |
| `calendar`             | yes | **Schedule** / appointment            | Showings, turnovers, contractor visits, STR check-ins.                                                           |
| `deals`                | yes | **Acquisitions** / acquisition ⚠️     | Buying the next duplex is a pipeline with stages, and stages are org rows. Q7 — they may not want it at all.     |
| `notes`, `assistant`   | yes | default                               | Every industry has them.                                                                                         |
| `products`             | yes | **Materials** / material ⚠️           | Only if the empty `Materials List` tab was a real intention. Q8 — my guess is no, and it should be hidden.       |
| `staff`                | yes | Team                                  | An LLC with a bookkeeper and a CPA. Small, but the invite flow is how the CPA gets in.                           |

Relationships already carry the graph this vertical runs on, with no new types needed:
`owns` (a member or an LLC owns a property), `part_of` (unit → property), `managed_by`,
`responsible_for`, `installed_at` (an appliance at a unit), `purchased_from`. A tenancy is
**not** a relationship — it has a rent and a deposit, so it is a `leases` row (below).

### What they explicitly do not get

| feature                                           | why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoices`, `ledger` ⚠️                           | **Not at launch, and this is the closest call in the document.** Rent genuinely is billed to a tenant, and the ledger would answer "who is behind" for free. But 42% of their rent arrives as a platform payout with nobody to bill, and a tenant ledger covering only the long-term half is worse than none. Delinquency is instead a **fold**: the lease says $1,650, the transactions say what came in. Turning them on later is one `industry_features` row. **Q13.** |
| `proposals`, `billables`, `quick-plans`           | A priced multi-option quote presented to a buyer. A landlord quotes nobody. Genuinely absent, not deferred.                                                                                                                                                                                                                                                                                                                                                               |
| `purchases`                                       | `purchases` is a **purchase order** — freight, distribution fee, expected/received dates, line-level receipt rollup. A $15.08 paint run at Home Depot is not a PO. The expense side needs the transaction spine below, not this.                                                                                                                                                                                                                                          |
| `orders`, `shipments`                             | Distribution. Nothing here ships.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `partner-contacts`, `patient-map`, `merchant-map` | Other verticals'.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `components`, `best-practices`                    | Template pages. Our scaffolding, not a customer's product.                                                                                                                                                                                                                                                                                                                                                                                                                |

Hiding is the absence of an `industry_features` row, not a flag — `resolveFeatures()`
answers `hidden` and the gate 404s the route — so every absence above costs nothing and
leaves no trace in the UI.

## What has to be built

Ranked by whether the product means anything without it. Items 1–3 are one piece of work
and should be scoped together; there is no useful slice that stops between them.

### 1. The chart of accounts — where Schedule E actually lives

Their `Lists` tab is 5 income categories, 20 expense categories and 6 CapEx classes. Their
`Annual_Summary` is 25 `SUMIFS` formulas, one per category, and it is **the deliverable**.

So: an `accounts` table (org-definable rows, like `pipeline_stages` — a dentist's chart and
a landlord's share nothing), each row carrying:

- `kind` — an enum we own: `income` / `expense` / `capital` / `transfer`. Four states in
  every vertical, so an enum, by the same rule that makes `stage_outcome` one.
- **`schedule_e_line`** — the integer IRS line this account rolls into. This one column is
  the difference between a pivot table and a tax deliverable.
- `useful_life_years` — on capital accounts, so depreciation has a life to divide by
  (Building 27.5, Land Improvements 15, Appliances 5, Furniture 7, Equipment 5).

And an **industry-default set installed by trigger**, exactly as `create_default_pipeline`
already gives every new org a board. Their 25 categories map cleanly, and the mapping is the
product:

| their categories                                          | Schedule E                                     |
| --------------------------------------------------------- | ---------------------------------------------- |
| Rent, Late Fees, Pet Fees, Application Fees, Other Income | 3 — Rents received                             |
| **Mortgage P&I**                                          | **splits: interest → 12, principal → nothing** |
| Bank Fees/Interest                                        | 13 — Other interest                            |
| Repairs                                                   | 14 — Repairs                                   |
| Maintenance, Cleaning, Lawn/Snow                          | 7 — Cleaning and maintenance                   |
| RGE (Electric/Gas), Water/Sewer, Trash                    | 17 — Utilities                                 |
| Property Taxes                                            | 16 — Taxes                                     |
| Insurance                                                 | 9 — Insurance                                  |
| Management                                                | 11 — Management fees                           |
| Professional Fees                                         | 10 — Legal and other professional              |
| Advertising                                               | 5 — Advertising                                |
| Travel/Mileage                                            | 6 — Auto and travel                            |
| Supplies                                                  | 15 — Supplies                                  |
| Licenses/Permits, Office/Software, Other                  | 19 — Other                                     |
| Capital Expenditures                                      | **not an expense** → 18, via depreciation      |

The `Mortgage P&I` row is why item 4 exists, and the `Capital Expenditures` row is why item
6 does. **Q9, Q10.**

### 2. Transactions — the spine

One table, one row per dollar in or out: `date`, `property_id` (asset), `unit_id` (asset,
**nullable = the Shared bucket**), `account_id`, `company_id` (the vendor or payee),
`contact_id` (the tenant, when there is one), `amount`, `memo`, and a link to its source
document if one exists.

Three notes on shape:

- **`amount` is always positive; `accounts.kind` gives the direction.** That is the
  payments rule (`kind` is `payment` or `refund`, never a sign a form can get wrong), and
  the workbook's own instruction tab already says "Amounts should be POSITIVE numbers.
  Type determines Income vs Expense." They agree with us.
- **This does not violate the ledger's "there is no ledger table."** That rule forbids
  materialising a _balance_ a query can answer. A categorised cash transaction is primary
  data — nothing derives it. The rollups on top of it stay folds.
- Money is `numeric(12,2)`, never float — the deals rule, and doubly so here.

`src/lib/server/crm/transactions.ts` owns the reads and writes; entry is the **generic
record form** (a `RECORD_FORMS` entry, a schema, one `case` in the insert switch), with
`company` / `contact` picker field types for the vendor and the tenant — the same field
types invoices already use for a customer.

### 3. Leases — and a rent roll that cannot drift ✅ **BUILT**

Shipped in the `properties_and_leases` migration: `property_id`, the tenant as a **party**
(`company_id` / `contact_id`, both nullable, at least one set — a shop or a corporate let
names the company), `starts_on`, `ends_on` (inclusive, null = month-to-month),
`rent_amount`, `rent_due_day`, `security_deposit`. **No status column** — see the modeling
decision above.

The Rent Roll tab becomes this list page, and three of their current bugs stop being
possible: a lease with no rent coming in is visible, rent coming in with no lease is
visible, and an ending lease is a date the app can read.

**The two revenue shapes fall out of this table rather than needing a second one.** A unit
with an active lease on a date is long-term; a unit with none is on short-term, and its
income arrives as transactions whose payee is a platform company (airbnb, VRBO, Furnished
Finder, `relationship = 'partner'`). Corn Hill Unit 1, which ran STR through June and then
took a furnished mid-term tenant on a 2026-07-01 → 2027-01-01 lease at $2,200, models
correctly with no special case. Gross-vs-net (airbnb deducts its fee before it pays) and
nights/occupancy are **phase 2** — the payout is the honest number for now. **Q11, Q12.**

### 4. Loans and the debt schedule — the biggest hole in their file

`Mortgage P&I` is one expense line, so principal and interest never separate, and
**Schedule E only deducts the interest**. $32,333.02 — 77% of everything they have booked
as an operating expense — is currently an undifferentiated lump, which means the
`-$4,110.82` on their dashboard labelled "Net Income (Schedule E)" is not a Schedule E
number and is not close to one.

The two loans are not even the same shape:

- **Corn Hill / FFCU, $2,419.00 × 7 = $16,933.00.** A conventional amortizing mortgage.
  Principal and interest split differently every month and only an amortization schedule
  knows how. Their deduction here is **overstated by the principal portion**.
- **Victor / Maison Lending, $2,566.67 × 6 = $15,400.02.** Hard money. The `Estimates &
Costs` tab lists it as a flat monthly charge with "1 YEAR LOAN IS DUE" beneath it, which
  is interest-only with a balloon — so very nearly all of it _is_ deductible.

**Neither split can be computed from the workbook**, because the terms are not in it. That
is the finding, and it is also the pitch: they cannot file correctly from this file.

Build: `loans` (lender `company_id`, `property_id`, `original_principal`, `interest_rate`,
`term_months`, `payment_amount`, `kind`: `amortizing` | `interest_only` | `balloon`,
`first_payment_on`) and `loan_payments` (`date`, `total`, `principal`, `interest`,
`escrow`). A loan is a record kind (`'loan'`) with a record page. The amortization split is
a **pure function** (`src/lib/crm/amortization.ts`) folded over the loan's terms — the way
`describeLedger()` folds and `taskBucket()` buckets — so entering a payment auto-splits it
and the split is auditable rather than stored blind. **Q14, Q15, Q16.**

### 5. The reports — and the empty `insights` section

The nav has an `insights` category with nothing in it. This vertical is what fills it, and
these three screens are the reason they would pay:

- **Schedule E pack** — category rollup by property and portfolio, per tax year, with the
  interest split and depreciation folded in, exportable. Their `Annual_Summary`, correct.
- **P&L** — monthly income / operating expenses / NOI / CapEx / net cash flow, per property
  and portfolio. Their `Corn_Hill_Monthly` and `Victor_Monthly`, from one query.
- **Rent roll & delinquency** — expected (from leases) against received (from
  transactions), which is where "Victoria S has paid nothing since May" surfaces.

**The tax year is a URL parameter, not a setting.** `?year=2026`, defaulting to the current
one, the way the ledger's customer filter and the views' filters already work. The
workbook's single worst structural flaw — `Setup!B3`, which breaks the file on 2027-01-01 —
simply does not have a form in this architecture. Worth saying to them in those words.

### 6. Depreciation is a fold, not a table

Their `CapEx_Depreciation` tab is 300 rows of `=(Cost/Life) * Year1Factor` with **zero
assets entered**, so it contributes $0 against $1,025.43 of capitalised 2026 spend (a
dishwasher and its install, placed in service June, 5-year life — roughly $120 of first-year
deduction they are not taking).

Do not port the sheet. A capital transaction already carries everything the formula needs:
cost (`amount`), class (`account_id`), placed-in-service date (`date`), and life
(`accounts.useful_life_years`). Depreciation is therefore a **pure function over capital
transactions**, computed per tax year, stored nowhere. Same half-month/mid-month convention
question their sheet fudges — straight-line with a `(12 - month + 1)/12` first-year factor
is not MACRS, and their own instructions tab admits it. **Q17: does their CPA want MACRS,
or is a straight-line estimate the point?**

### 7. Receipts — cheap, and probably matters more than bank feeds

Five Home Depot runs, two plumbers, a Lowes, a handyman. At 81 transactions a year the data
entry is not the burden; finding the receipt in March is.

`entity_images` already exists over a private Supabase Storage bucket with an
`{org_id}/{entity_type}/{entity_id}/…` path shape the storage policies key off — and it is
pinned by a check constraint to `'asset'`, with the migration's own comment saying that is
how it is meant to grow. **Widening that constraint to include transactions is the whole
build.** Phone-camera capture on the transaction form is the feature. **Q18.**

### 8. Smaller, known, cheap

- **Vendors stop being freeform for free.** `RGE`/`RGe` and `Town of Victor`/`Village of
victor` are fixed by the vendor field being a `company` picker — a field type that already
  exists and that invoices already use. No build, just the right control. (`Town of Victor`
  and `Village of victor` may also be two genuinely different taxing authorities — **Q19**.)
- **The 2031 typo is a whole bug class, closed by a schema.** A zod date field with a
  plausible range is the generic record form's default behaviour. Their two rows, and every
  future one, become impossible rather than invisible.
- **Payment Method: don't build it.** 0 of 81 filled. If it matters it is a custom field.
- **Don't port `Vacancy Loss`, `Internet`, or `Materials List`.** Always zero, always zero,
  and empty. Porting aspiration is how a clean model gets cluttered on day one.
- **The rehab budget** (`Estimates & Costs`) is a real want but a separate feature: line
  items with estimated / actual / variance, per property. Note that their own sheet does not
  reconcile — Total Rehab Estimate $9,850 minus Total Rehab Costs $0 should be $9,850, but
  Over/Under Budget reads **$10,850**, because a `1500` was hand-typed over a formula in the
  variance column. **Q20: is the rehab tracker in scope, or is it a one-off for the Victor
  project?**
- **The CPA needs a login, not an export.** See the role below; it is one row.

## The sidebar, in this vertical's order

`industry_features.sort_order` is per-industry and null inherits, and a vertical that sets
an order sets it for **every** feature in that section. The order is the order of the work:
they open the app to enter what they spent and see what it means.

Shipped (the `real_estate_portfolio_features` migration):

```
General    Assistant 100 · Notes 200 · Staff 300           (inherited)

CRM        Properties           100   the portfolio
           Leases               200   on what terms
       [   250 left open for whatever slots in next    ]
           Tenants              300   who is in it
           Maintenance requests 400   what broke
           Schedule             500   today
           Tasks                600
           Vendors              700   who you pay
           Equipment            800   what you own that is not a building
           Acquisitions         900   the next one
```

Still to come, once the accounting spine exists:

```
Money      Transactions        100   the spine — every dollar in or out
           Chart of accounts   200   what the categories mean
           Loans               300   and what is really interest

Insights   Schedule E pack     100   the deliverable
           P&L                 200   per property, per month
           Rent roll           300   expected against received
```

`Money` is not one of the six categories `features_category_check` allows (`general`, `crm`,
`tools`, `insights`, `library`, `other`). Either these three go under `tools` — defensible,
they are the machinery — or the constraint gains a seventh value. **I would add `money`**:
`tools` in every other vertical means the catalog a price is built out of, and putting a
chart of accounts there muddies a section that currently has one clear meaning. One line in
a migration, one entry in `NAV_CATEGORIES`. **Q21.**

## Vocabulary and roles

Two `terms` rows exist (`proposal_presenter`, `proposal_responsible`) and **neither applies
here** — proposals are hidden, so no `industry_terms` rows are needed at all. This is the
first vertical to need none, which is the vocabulary system working: a word that is not used
is not configured.

The role ladder, at `0008`:

| id suffix | role              | holds                                                                                |
| --------- | ----------------- | ------------------------------------------------------------------------------------ |
| `…0001`   | Viewer            | `read` on everything in the industry                                                 |
| `…0002`   | **Accountant** ⚠️ | `read` on insights, transactions, loans, accounts — **and nothing else**             |
| `…0003`   | Bookkeeper        | `manage` transactions, accounts, vendors, loans; `read` the rest                     |
| `…0004`   | Property Manager  | `manage` properties, tenants, leases, maintenance, tasks, schedule; `read` the money |
| `…0005`   | Manager           | `manage` everything                                                                  |
| `…0006`   | Owner             | `manage` + `delete` everything                                                       |

**The Accountant row is a product feature disguised as configuration.** The entire workbook
exists to be handed to a CPA, and today that hand-off is an emailed file — which means it is
stale the moment it is sent, and it carries tenant names and payment history that the CPA
does not need. A read-only role scoped to the reports replaces a yearly email with a login,
and it costs one `roles` row and a handful of `role_permissions`. It is also the cleanest
possible demonstration of why the feature-and-level model was worth building. **Q22: does
their CPA want that, or do they want a file?** (Ask. Many want the file.)

Note what is _not_ needed here: **row-scoped visibility**, the gap that blocks
merchant-services entirely. One owner, one portfolio, everyone sees everything. This
vertical can ship without the largest open platform question being answered, which makes it
a materially safer first build than the ISO one.

## The AI side

Ranked by how much of their year it removes.

| what                        | what it does                                                                                                                             | needs                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Receipt reader**          | Photograph a Home Depot receipt → date, vendor, amount, suggested account and property. The highest-value thing on this list.            | Item 7 + a vision call   |
| **Categorisation suggest**  | "Luba Cleaner, $150, Corn Hill Unit 1" → Cleaning, every time. Learns their history, never overrides it.                                 | Items 1–2 + one tool     |
| **Statement / 1098 import** | A lender's year-end statement in, the interest/principal split out, reconciled against `loan_payments`.                                  | Item 4 + a vision call   |
| **Year-end review**         | "What looks wrong before this goes to the CPA?" — a 2031 date, an uncategorised row, a capital item expensed, a lease with no rent.      | Items 1–3, then trivial  |
| **Ask the books**           | "What did Corn Hill cost me in utilities last year?" — conversational Schedule E, which is the whole product with a different interface. | Items 1–2 + read tools   |
| **Lease watch**             | "Dale Hess's lease ends in 18 days." Genuinely useful and genuinely blocked.                                                             | Item 3 **+ a scheduler** |

Adding a tool is one file, one line in each map in `tools/index.ts` and a label, and **every
tool is bound to a feature and a level** — so the Accountant role above cannot ask the
assistant about tenants either. The gating comes free.

Two constraints to be honest about, both familiar: **anything proactive needs a scheduler we
do not have**, and a lease carries an SSN on the application and a bank account on the
autopay — decide deliberately, in writing, whether those live here at all before the first
tenant is keyed in. **Q23, Q24.**

## Platform gaps this vertical shares with merchant-services

Two verticals now want the same two things, which is what turns a nice-to-have into a
roadmap item:

1. **Per-industry default reference data.** Merchant-services needs MID/MCC as custom fields
   every new org gets; this vertical needs a chart of accounts and unit attributes. The
   mechanism exists in miniature — `create_default_pipeline()` gives every new org a board
   by trigger — and generalising it to per-industry defaults is small, benefits every
   vertical, and is now blocking two.
2. **A scheduler.** Residual-import reminders and attrition sweeps there; lease expiry, rent
   expectation and year-end prep here. Nothing in the template runs on a clock.

And one this vertical adds alone: **views over a third source.** `views.source` is checked
`in ('company', 'contact')`. A "Units" view, or "Vacant units", or "Leases expiring in 60
days", all want `asset` and `lease` sources. Worth doing when a second vertical asks, not
for this one.

## Where the code line actually falls

"No code" has a precise meaning in this repo: **no change under `src/`**. An industry is
`industries` + `industry_features` + `roles` + `role_permissions` + `industry_terms` rows,
and the nav, the ⌘K palette, the page titles, the gate, the record pages and the role picker
all follow from them. Three tiers, and the boundaries are not where they look.

> **This tier analysis is kept as written, and it is the route the build actually took
> first** — `20260912095000_real_estate_industry.sql` is exactly the Tier 0 migration
> below. It was then superseded by the decision to make properties and leases real tables,
> which is Tier 2 work. Both halves are on the branch, in that order, because the cheap
> version is what proved the words and the shape before anything schema-shaped was
> committed to. The boundaries below are still the boundaries.

### Tier 0 — pure data, zero `src/` change

Ships as one migration, plus rows an owner/admin can type into the running app.

| what                                          | how                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| The industry and its whole feature map        | `industries` + `industry_features`, with this vertical's names and `sort_order`    |
| Every rename                                  | `industry_features.name` / `.noun` — Properties, Tenants, Vendors, Maintenance     |
| Every omission                                | the absence of a row — `hidden`, and the gate 404s it                              |
| The six-rung role ladder, Accountant included | `roles` + `role_permissions` at `0008`                                             |
| **Vendors as a nav entry**                    | the **already-shipped `suppliers` view**, renamed. No new view row at all.         |
| Properties and units as records               | `assets` rows; `asset_type` is free text, so `'property'` / `'unit'` need nothing  |
| Unit → property                               | a `part_of` relationship — the type is already shipped `'asset' → 'asset'`         |
| Owner, manager, responsible party             | `owns`, `managed_by`, `responsible_for` — all shipped                              |
| Maintenance request → the unit it is about    | a `related_to` relationship. Clunky, but real, and the Relationships card draws it |
| Unit attributes (beds, baths, sqft, rent)     | custom fields on `entity_type = 'asset'` — no restriction to parties               |
| **Photos of a property or unit**              | `entity_images` — its check constraint pins it to `'asset'`, which is exactly this |
| An acquisitions pipeline with its stages      | `pipelines` + `pipeline_stages` are org rows, editable in the app                  |
| Tenants, tasks, calendar, notes, assistant    | as they are                                                                        |

That is a working property-and-tenant CRM with photos, a maintenance queue, a schedule and
a role model, for one migration and no TypeScript. It is a real thing and it demos well.

### Tier 1 — data plus one or two lines

- **A new view** (`Vacant units`, `Expiring leases`) is a `views` + `features` + `pages` row
  and **one line in `FEATURE_IDS`** (`src/lib/features/types.ts`). That is the whole `src/`
  diff merchant-services needed. But note both examples want an `asset` / `lease` source and
  `views.source` is checked `in ('company', 'contact')` — so the cheap views here are the
  ones over companies and contacts, and those are largely already shipped.
- **A `money` nav section** is one value in `features_category_check` and one entry in
  `NAV_CATEGORIES`.

### Tier 2 — genuinely needs code

Everything that makes it an accounting system, and two smaller things that look free and
are not:

| what                              | why it is code                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chart of accounts                 | new table + an industry-default trigger; no existing table carries `schedule_e_line`           |
| Transactions                      | new table, new module, a `RECORD_FORMS` entry and an insert-switch `case`                      |
| Leases                            | new table, new `crm_entity_type`, `crm_entity_exists()` branch, delete trigger, `RECORD_KINDS` |
| Loans + payment splits            | two tables, a record kind, and a pure amortization fold                                        |
| Schedule E pack, P&L, rent roll   | three new routes; the `insights` section is empty for a reason                                 |
| Depreciation                      | a pure fold over capital transactions — small, but it is `src/`                                |
| **A property's address**          | `addresses` is pinned to parties, and the record page gates the card on `party`                |
| **Receipt photos on a spend row** | `entity_images` is pinned to `'asset'`; a transaction is not one                               |

The last two are the instructive ones. `entity_images` accepts an asset and refuses
everything else, and `addresses` accepts a party and refuses everything else — so **property
photos are free and property addresses are not**, which is the opposite of what you would
guess. Both are one-constraint widenings, both are named in their own migrations as the
intended way to grow, and neither is zero.

### The hack to refuse

`purchases` is tempting: it has a vendor, a total, line items, and `'purchase'` is a
`crm_entity_type`, so you could hang property / unit / category on it as custom fields and
call it an expense ledger with no new table. Don't. It is a purchase order — `freight`,
`distribution_fee_pct`, `expected_at`, `received_at`, a line-level receipt rollup and a
generated `total` — and a $15.08 paint run at Home Depot would carry all of it. It also
breaks the rule that a kind's fields are typed by how they render, not by what an org
happened to define. The transactions table is fifty lines of SQL; the hack costs more.

## What has shipped

Four migrations, in the order they were built, and the order matters:

1. **`20260912095000_real_estate_industry.sql`** — the industry, its feature map with this
   vertical's words and order, the six-rung role ladder. **Config only**: no table, no
   column, no enum value, and not one line of `src/`. This is the Tier 0 migration above,
   and it is what proved the words and the shape before anything schema-shaped was
   committed to.
2. **`20260912100000_property_entity_kinds.sql`** — `'property'` and `'lease'` as
   `crm_entity_type` values, alone, because Postgres refuses to use an enum value in the
   transaction that added it.
3. **`20260912100100_properties_and_leases.sql`** — the two tables, their RLS and column
   grants, the depth trigger, the `crm_entity_exists()` branches and delete triggers, the
   two widened constraints (addresses, entity_images), the two features, and two new
   relationship types (`services`, `located_at`). It also **widens `owns`** rather than
   duplicating it: that type shipped as `(null → 'asset')`, which read as the whole truth
   while an asset was the only thing an org could own.
4. **`20260912100200_real_estate_portfolio_features.sql`** — the industry moves onto them:
   Properties and Leases join the map, the CRM section is renumbered, and `assets` becomes
   **Equipment**. Undoing the previous migration's naming is an `update`, which is the
   point of a word being a row.

On the app side: `$lib/server/crm/properties.ts` and `leases.ts`, the pure
`$lib/crm/leases.ts`, two describers and their `getRecord()` branches, a property's units
and a tenant's leases as related records, two `RECORD_FORMS` entries with a new
**`property` picker kind**, and the two list pages. `supabase/seed.sql` carries a fixture
portfolio whose rent roll is deliberately untidy — a holdover whose fixed term ended five
days ago and the month-to-month that replaced it at a higher rent, a lease ending in
eighteen days, an ended tenancy on a unit now running short-term, and a vacant unit
mid-rehab. Every one of those is a shape the model has to survive, taken from the workbook.

Proven with a full `db:reset` from empty, and smoke-tested against a running dev server:
the pages render with the industry's words (Properties, Leases, Tenants, Vendors,
Equipment), the rent roll computes Rolling / Ended / Current in the browser, a property
shows its units, its leases, its address and its photos, creating a unit works, creating a
unit _of a unit_ is refused by the database with its own message surfaced into the form as
a 400, and `/properties` 404s for an org in another industry.

**And it is still not the whole product.** This is a property-management CRM: portfolio,
rent roll, tenants, maintenance, schedule. The reference customer's problem is a tax
return, and none of the accounting spine is in it. Show this to settle the words and the
shape; price the accounting separately.

Two limits worth knowing before they are promised:

- **The relationship graph is read-only in the app.** `createRelationship()` has exactly
  one caller (task assignment) and the record page has no action that writes one — so "who
  services this building" and "which unit is this dishwasher in" are expressible in the
  schema, seeded in the fixture, and not yet enterable in the UI.
- **A maintenance request still cannot name its property.** `support_tickets` carries
  `company_id` and `contact_id` and no entity link, so the seed uses `related_to`. A second
  vertical wanting that is the signal to give tickets the entity link the rest of the CRM
  has.

## Recommendation on sequencing

The first slice that is a _product_ is items **1, 2 and 3 together** — chart of accounts,
transactions, leases. That is every dollar categorised, every unit accounted for, and a
category rollup already better than the workbook because it cannot silently drop a 2031 row.
Item 4 (loans) is what makes the rollup _correct_ and should follow immediately; until it
lands, the Schedule E pack must show mortgage payments as an undeducted line with a visible
warning rather than quietly repeating the workbook's error.

Item 5 (reports) is the visible deliverable and item 7 (receipts) is the daily one. Items 6
and 8 are finishing.

## Open questions → the customer document

Q1–Q24 above are the questions we cannot answer for them. The ones that actually change what
gets built, rather than what something is called, are **Q1–Q3** (is a unit an asset or a
table), **Q13** (invoices on or off), **Q14–Q16** (the loan terms — without these the tax
number stays wrong), **Q17** (MACRS or straight-line) and **Q21** (a `money` nav section).
Everything else is a word, and a word is a row.
