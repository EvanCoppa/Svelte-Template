# Merchant services: designing the payment-processor vertical

The customer is an **ISO / agent office**: they sign businesses up to process card
payments through a back-end processor, and they get paid a share of what those businesses
process, every month, for as long as the business keeps processing. Their reps go out and
sell to anyone who takes money — a smoothie shop, a liquor store, a dentist, a contractor —
so the vertical is not defined by who the merchant is, it is defined by **what the rep
does**: find a business, get its current processing statement, show it a cheaper one, get
an application signed, get it boarded, and then live off the residual.

That last clause is the whole thing. Every vertical we serve today ends at the sale. This
one **begins** there: the sale creates an annuity that has to be measured, split between
people, and defended against attrition for years. That is the part the platform does not
have, and it is the part the deal hinges on.

This document is the design: what they get from the registry as it stands, what they
explicitly do not get, what has to be built, and which of those decisions we cannot make
without asking them. The questions are numbered here and in
`docs/discovery/merchant-services-discovery.html`, the document that goes to the customer.

## How an industry is added (the short version)

Nothing here is code. `docs/features.md` is the contract — an industry is
`industries` + `industry_features` + `roles` + `role_permissions` + `industry_terms` rows,
and the sidebar, the ⌘K palette, the page titles, the gate, the record pages and the role
picker all follow. So the design below is **one migration plus a `FEATURE_IDS` line per
new feature**, and everything in the "would need built" section is the part that isn't.

Proposed industry id: **`merchant-services`**, name "Merchant Services". Role ids follow
the catalog's scheme (`b0000000-0000-0000-00II-0000000000RR`); crm..beverage occupy
`0001`–`0006`, so this vertical is **`0007`**.

## What they get from what exists

| feature                       | in? | what it is called here             | why                                                                                                                      |
| ----------------------------- | --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `companies`                   | yes | **Merchants** / merchant           | The business that processes. `relationship` splits customer (a merchant) from partner (a bank, an association, an ISV).  |
| `contacts`                    | yes | **Merchant contacts** / contact ⚠️ | The owner who signs and the manager who calls when the terminal dies. Q4.                                                |
| `deals`                       | yes | **Applications** / application ⚠️  | The funnel from lead to boarded. Stages are org rows, so their funnel is data, not code. Q5.                             |
| `proposals`                   | yes | **Rate proposals** / proposal ⚠️   | Two to four priced options side by side is exactly the savings presentation. Q8.                                         |
| `billables`                   | yes | **Fees** / fee                     | The fee schedule: per-item, monthly, PCI, gateway, chargeback, batch. `unit` = "transaction" / "month" / "device".       |
| `quick-plans`                 | yes | **Pricing programs** / program     | A named bundle of fees that fills a proposal option in one click — "Retail IC+ 25bps", "Flat 2.6 + 10", "Cash discount". |
| `products`                    | yes | **Equipment** / equipment item ⚠️  | The catalog of terminals, gateways and software they resell. Inventory columns already exist. Q11.                       |
| `assets`                      | yes | **Terminals** / terminal ⚠️        | The serialized unit sitting on a counter: who owns it, who holds it, where it is installed. Q12.                         |
| `calendar`                    | yes | **Schedule** / appointment         | Field reps book merchant visits; drag-to-move already works.                                                             |
| `tasks`                       | yes | Tasks                              | Follow-ups, and the underwriting chase list.                                                                             |
| `tickets`                     | yes | **Support cases** / case ⚠️        | Chargeback, missing deposit, terminal down. Has a thread, a priority and an assignee already. Q15.                       |
| `staff`                       | yes | **Team** ⚠️                        | The roster and invitations. Its name is the least of the questions it raises — see Q6 and Gap 1.                         |
| `notes`, `assistant`          | yes | default                            | Every industry has them.                                                                                                 |
| `merchant-map` **(new view)** | yes | Merchants, on a map                | A company view with `layouts {map,table}`. Territory work for a canvassing rep — the geocoder and MapLibre are wired.    |
| `prospects` **(new view)**    | yes | Prospects                          | A company view filtered `status in (lead, prospect)`. One row; no route.                                                 |
| `referral-partners` **(new)** | yes | Referral partners                  | A company view filtered `relationship in (partner)` — banks, associations, ISVs, VARs that send deals.                   |

Three of those are **views**, which is the cheapest thing we ship: a `views` row plus a
`features` row at `/views/<id>` and the nav, the gate, the title and the grants all come
for free (`docs/views.md`). No route, no load, no component.

### What they explicitly do not get

| feature                        | why not                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoices`, `ledger` ⚠️        | **An ISO does not bill its merchants.** The processor deducts fees from the merchant's own deposits; nothing is ever owed to the ISO on an invoice. Ship them only if they resell equipment on terms — that is Q13. Meanwhile the money question they actually have is the mirror image: what the processor owes _them_ (Gap 3). |
| `suppliers` view               | They buy terminals from a distributor, but one or two of them, forever. A company with `relationship = supplier` covers it without a nav entry. Revisit if Q11 says they hold real inventory.                                                                                                                                    |
| `partner-contacts` view        | Superseded by `referral-partners`: the referral relationship is with the **bank or the association**, and the person moves. Their view is over companies, not contacts.                                                                                                                                                          |
| `patient-map`                  | Dentistry's. `merchant-map` is the same mechanism for this vertical.                                                                                                                                                                                                                                                             |
| `components`, `best-practices` | Template pages. They are our scaffolding, not a customer's product; no real vertical should ship them.                                                                                                                                                                                                                           |

Hiding is the absence of a row, not a flag — `resolveFeatures()` answers `hidden` for a
feature with no `industry_features` row, and the gate 404s the route. So "does not get"
costs nothing and leaves no trace in the UI.

## The sidebar, in this vertical's order

`industry_features.sort_order` is per-industry and null inherits, and the rule from
`docs/features.md` is that **a vertical that sets an order sets it for every feature in
that section** — so both sections are listed in full. The order is the order of the work:
a rep opens the app to see what is in flight, not to browse a database.

```
General   Assistant 100 · Notes 200 · Team 300          (inherited)

CRM       Applications      100   what is in flight right now
          Merchants         200   the book
          Merchants (map)   300   a cut of the book, for territory work
          Prospects         400   a cut of the book, not yet signed
          Referral partners 500   where the deals come from
          Merchant contacts 600   the people inside all of it
          Rate proposals    700   the artifact that wins the deal
          Schedule          800   today
          Tasks             900
          Support cases    1000   after the sale
          Terminals        1100   what is deployed

Tools     Fees              100   what a program is built out of
          Pricing programs  200   the bundles reps actually pick
          Equipment         300   the hardware catalog
```

## Vocabulary

Two terms exist (`industry_vocabulary` migration) and both need this industry's row:

| term                   | label here                  |
| ---------------------- | --------------------------- |
| `proposal_presenter`   | **Rep** ⚠️ (or Agent)       |
| `proposal_responsible` | **Relationship manager** ⚠️ |

Both are Q7. A word that is not a feature's name is never a constant in `src/` — it is a
`terms` row, so getting these wrong costs one migration, not a refactor.

## Roles

The ladder mirrors medical-supplies' six, which is the closest existing shape (a sales org
with a support desk and a coordinator):

| id suffix | role                   | holds                                                                                                               |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `…0001`   | Viewer                 | `read` on everything in the industry                                                                                |
| `…0002`   | Sales Rep              | `manage` merchants, contacts, applications, proposals, tasks, schedule; `read` fees, programs, equipment, terminals |
| `…0003`   | Merchant Support       | `manage` support cases and tasks; `read` merchants, contacts, terminals                                             |
| `…0004`   | Onboarding Coordinator | `manage` applications, tasks, terminals, equipment; `read` the rest                                                 |
| `…0005`   | Sales Manager          | `manage` everything                                                                                                 |
| `…0006`   | Principal              | `manage` + `delete` everything                                                                                      |

**And this is where the design stops being free.** See Gap 1 immediately below: a role
grants a level on a _feature_, for the whole org. There is no role in this catalog, or any
catalog, that means "a rep who sees their own merchants and nobody else's" — and in an
office of 1099 agents that is not a nice-to-have, it is the condition of letting them log
in at all.

## What has to be built

Ranked by whether the deal works without it.

### 1. Row-scoped visibility — "my book" (platform, not this industry)

Today every tenant-scoped table's select policy is
`using (private.org_role(org_id) is not null)`: **every member of an org sees every row in
it.** That is correct for a dental practice and wrong for an agent office, where reps are
usually 1099 contractors who compete with each other and whose merchant list is their own
asset. An ISO cannot put forty agents in one org under the current policy.

The three ways out, in order of how much they cost:

- **One org per agent office.** Free — multi-tenancy already does it. Fails as soon as the
  ISO wants a view across all of them, which they will on day one.
- **A visibility scope on the grant.** A third axis next to mode and level: a grant is
  `own` or `all`, an ownership column is honoured by the policy (`deals.assigned_to`
  already exists; companies and contacts would need the equivalent), and `private.*`
  helpers answer it so no policy queries `organization_members` directly. This is the real
  answer, it is a platform feature every vertical with field reps will want, and it is the
  single largest correctness decision in this project.
- **System-admin-style bypass for principals.** Already exists (`private.org_role()`
  answers `owner` for a system admin) and is the pattern to copy for "the principal sees
  everything".

Nothing else on this list matters if this one is wrong. **Q6, Q17.**

### 2. Merchant accounts (MIDs) — a new record kind

A merchant is not the unit of anything financial; the **MID** is. One business can have
five of them (a location each, or a card-present and a card-not-present account), each with
its own processor, its own open and close dates, its own volume and its own residual. Every
number they care about hangs off the MID, and there is nowhere to put one today.

This is the standard "new kind of record" checklist (`crm_party_model` migration's closing
comment): one `crm_entity_type` value, a `private.crm_entity_exists()` branch, a delete
trigger calling `on_crm_entity_gone()`, a table, a `src/lib/server/crm/` module, an entry in
`RECORD_KINDS` and `RECORD_KIND_META`, a branch in `getRecord()`, and the feature + pages
rows. Well-trodden; a day or two, and it unblocks everything below. **Q9, Q10.**

### 3. Residuals — the reason they are buying software

Every month each processor publishes a residual report: per MID, the volume, the income,
the expenses and what the ISO is owed. The office downloads three or four of those in three
or four different CSV shapes, reconciles them in a spreadsheet, splits each line among the
agents who share it, and pays everyone. That spreadsheet **is** the business, and it is what
they will actually judge us on.

What it takes:

- `residual_imports` — one upload of one processor's monthly report, with its raw rows kept.
- `residual_lines` — per MID per period: volume, transactions, income, expense, net.
  Immutable once a period closes.
- `commission_splits` — who shares a MID's net and at what percentage, dated, so a
  handover is history rather than a lost fact (the rule `assigned_to` relationships follow).
- `agent_payouts` — the statement a rep gets, foldable from the lines the way
  `describeLedger()` folds invoices and payments. **Do not store a balance a query can
  answer** — that is the ledger's Rule 1 and it applies here exactly.
- An importer per processor. This is the unglamorous, unavoidable part: a mapping per
  report shape, not one parser.

The nearest thing we have is the ledger, and it is the mirror image (money owed _to_ them
by the processor, not by a customer), so it is a model to copy, not a table to reuse.
**Q18–Q22.**

### 4. Statement analysis — the artifact the sale runs on

A rep's entire pitch is: here is your current statement, here is your effective rate, here
is ours, here is the difference. Today that is a spreadsheet or a back-office person with a
calculator, and turnaround is the constraint on how many deals a rep can run.

The mechanism: upload the merchant's statement → extract volume, transaction count, and
every fee line → compute the effective rate → generate a `proposals` row with the current
program as the base case and one to three pricing programs as the options. `proposals` is
already exactly this shape (`docs/proposals.md`: a base case and priced options side by
side), `base_config` jsonb is already where a vertical's base case belongs, and
`quick_plans` already fills an option in one click. **So the CRM half exists; the extraction
is the build**, and it is an AI build (below). **Q23–Q25.**

### 5. Application packets and documents

An application needs a signed app, three months of statements, a voided check, a driver's
licence and sometimes a business licence. Today there is no document attachment at all: the
only file mechanism is `entity_images`, pinned by a check constraint to `'asset'`, over a
private Supabase Storage bucket with the path shape `{org_id}/{entity_type}/{entity_id}/…`
that the storage policies key off.

Widening that constraint — the migration's own comment says that is how it is meant to grow —
plus a required-documents checklist per application, is the whole build. Modest, and it
removes a real reason they would keep using email. **Q14.**

⚠️ **And a boundary worth stating out loud before anything is stored:** an application
contains a Social Security number, a tax ID and a bank account. Card numbers must never
touch us at all. Either those fields live only in the processor's portal and we hold a
reference, or we build restricted, encrypted, audited fields for them. That is a decision
to make deliberately, in writing, before the first merchant is keyed in. **Q26.**

### 6. Agents who are not users

A sub-agent earns a split and never logs in. `relationships` already models the graph
(`'member'` is a kind, keyed by the membership), but a person who has no membership is not
a member — they are closer to a contact, and the split has to point at something durable.
Decide once, when Gap 3 is designed, not twice. **Q6.**

### 7. Portfolio insights — the empty `insights` section

The nav has an `insights` category with nothing in it, and this vertical is what fills it:
volume trend, attrition (a MID whose volume falls off a cliff is churning, and it is worth
more to save it than to sign a new one), effective-rate drift, rep leaderboard, expected
versus received residual. Needs Gaps 2 and 3 first — all of it is a fold over
`residual_lines`. **Q27.**

### 8. Smaller, known, cheap

- **An industry's default pipeline.** `create_default_pipeline(org)` hardcodes one "Sales"
  board for every new org regardless of industry. This vertical wants Lead → Statement
  received → Proposal presented → Application signed → Underwriting → Approved → Deployed →
  First batch. Making the default board industry-aware is small and benefits every vertical.
- **Merchant portal.** `contact_profiles` already links an auth user to the contact they
  are, and `handle_new_user` already skips the personal org for `account_type: 'portal'`.
  The hook exists; the screens do not. **Q16.**
- **E-signature and boarding submission.** Sending the application to the signer, and
  keying (or API-pushing) it to the processor. Integration work, gated on which processors —
  **Q2**.
- **No scheduled jobs exist.** Anything that runs monthly (a residual import reminder, an
  attrition sweep, a rep's payout statement) has no home yet. Worth knowing before promising
  anything proactive.

## The AI side

Right now the assistant is a chat with ten read/write tools over the CRM, gated by feature
and level. It is a good foundation and it is not what this customer will picture when we say
AI. Ranked by how much of their day it removes:

| what                         | what it does                                                                                                                                             | needs                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Statement reader**         | A photo or PDF of a competitor's statement in, structured volume/transactions/fees and an effective rate out.                                            | Gap 4; a vision model call and a `proposals` write |
| **Proposal drafter**         | "Build them an IC+ and a cash-discount option off that statement" → a real `proposals` row with options.                                                 | Gap 4 + `quick_plans` (exists)                     |
| **Attrition watchdog**       | "Six merchants processed under half their normal volume this month" — the highest-value thing on this list, because saving a merchant beats signing one. | Gaps 2, 3, 7 + a scheduler                         |
| **Residual auditor**         | Expected versus received, per MID, per processor — processors do underpay, and nobody checks by hand.                                                    | Gap 3                                              |
| **Visit prep**               | "Brief me on this merchant before I walk in": history, open cases, their MCC, what we quoted last time.                                                  | Mostly exists — a new tool over existing modules   |
| **Visit capture**            | Rep talks after a call; out come a note, the tasks, and the application moved a stage.                                                                   | Mostly exists — one `manage` tool                  |
| **Underwriting pre-check**   | Flags a prohibited or high-risk MCC before an application is wasted.                                                                                     | Gap 2 + their processors' rules                    |
| **Merchant support answers** | Deposit timing, fee explanations, chargeback process — deflects the calls the support desk repeats daily.                                                | `tickets` (exists) + their content                 |

Adding a tool is one file, one line in each map in `tools/index.ts` and a label
(`docs/assistant.md`), and **every tool is bound to a feature and a level**, so an agent
who cannot read residuals cannot ask the assistant about them either — the gating comes
free. The two constraints to be honest about: **anything proactive needs a scheduler we do
not have**, and a model must never be handed an SSN or a bank account (Q26 again).

**Q28–Q30 are the ones that matter here**, because what they imagine when they hear "AI" is
the single most likely place for this engagement to disappoint, and it is cheap to find out.

## Open questions → the customer document

`docs/discovery/merchant-services-discovery.html` is the same numbering, written for them rather than
for us. It is the thing to send; the answers turn every ⚠️ above into a row in one migration.

## What has shipped, and what the answers still change

The config half is **built**: `supabase/migrations/20260911150000_merchant_services_industry.sql`
is the industry, its feature map with this vertical's words and order, the three
views, the six-rung role ladder and the two vocabulary rows — data only, so
`database.types.ts` is untouched and the only `src/` change is the three view ids in
`FEATURE_IDS`. `supabase/seed.sql` adds Keystone Payments (pro) and Cobalt Merchant
Services (free), the boarding board in place of the generic one, and MID / MCC /
average ticket / current processor as custom fields on a merchant.

Every ⚠️ above therefore shipped as a **default, not a decision**: "Merchants",
"Applications", "Rate proposals", "Support cases", "Terminals", "Quick options",
"Rep" and "Relationship manager" are the words in the database today, and a word is
a row — Q4, Q5, Q7, Q8, Q12 and Q15 each cost one `update` when the answers come
back, never a refactor. The same is true of the absences: turning invoices on for
them (Q13) is one `industry_features` row.

Two limits the build surfaced, both written into the migration and seed where they
will be read:

- **A custom field holds one value**, so `mid` on a merchant is honest only while
  that business has one location. It is a bridge to gap 2, not a substitute.
- **`billables.unit_price` is a fixed money amount**, so the fee schedule covers the
  monthly, per-item and incident fees but not the discount rate, which is a
  percentage of volume. A rate proposal built from it is the fixed half of the quote.
  Whether that matters on day one is Q24.

And one thing this vertical needs that no industry can have yet: an org onboarded
tomorrow gets none of those custom fields, because `custom_field_definitions` is
per-org working data. The fix is small and benefits every vertical — a table of
per-industry defaults and one trigger, alongside the `create_default_pipeline` one
that already exists — and it is deliberately not in that migration, which changes no
behaviour at all.

Everything under "What has to be built" is still ahead, and should be scoped and
priced as one piece of work — starting with gap 1, which is a platform decision
rather than a customer one.
