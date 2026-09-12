# Gold Standard Processing: the build brief, read against the shipped vertical

GSP is a merchant services ISO with five named people — Eli (owner), Matt and Anthony
(full-cycle reps), Cody (phone prospecting and statement collection), Davey (onboarding,
installs, PCI) — and they have written a seventeen-module brief for a CRM that is also a
coaching, onboarding and training system. This document reads that brief against what
`merchant-services` actually is today (the
`20260911150000_merchant_services_industry.sql` migration and the design behind it in
`docs/industry-merchant-services.md`) and answers one question: **what do we have to add
that we do not have?**

Three buckets throughout: **shipped** (a row exists, or the platform already does it),
**config** (one migration, no `src/` change worth the name), and **build** (schema plus
code). Everything is judged against the brief's own core rule, which is the sentence the
whole thing hangs on:

> Every open deal must have an owner, stage, next action, due date, last activity, and
> source. If a deal can sit quietly with no next step, the CRM failed.

## The short answer

The vertical's **config** fits them well — the funnel, the words, the nav order and the
role ladder are already the right shape, and their ten stage names are per-org rows, so
their board is data. What is missing is not decoration:

1. **We cannot express their core rule.** `deals` has no `next_action`, no
   `next_action_due_at`, no `last_activity_at` and no `source`. Four columns and a trigger,
   but until they exist the brief's one non-negotiable is unenforceable and every dashboard
   they asked for is unbuildable.
2. **There are no dashboards.** The `(app)` index is still the template's "Welcome back"
   marketing page, and the `insights` nav category is empty in every industry. Their
   modules 1 and 2 — the Command Center and the Rep Home — are the product to Eli.
3. **Three modules have no home at all**: the training/resource centre (module 17), the
   cadence engine (module 10) and call recordings/transcripts (module 8). Nothing in the
   schema is close to any of them.
4. **Two of the design doc's headline gaps just got demoted** by the brief, and one is
   confirmed. Details below — this is the part worth reading before quoting the work.

## Where the brief contradicts our design

`docs/industry-merchant-services.md` was written before we had their answers. Four of its
judgements move.

### Row-scoped visibility ("my book") is not the blocker here — gap 1, demoted

The doc calls it the single largest correctness decision, on the reasoning that an office
of forty 1099 agents cannot share an org under a policy where every member sees every row.
GSP has **five people**, Eli wants full visibility, and the brief's permission section ends
with "avoid permissions so strict that reps cannot create or update deals" and lists
"team leaderboard/wins" as something reps should see. Their only hard exclusion is
Hailey — which is no membership at all, and free.

So it stays a real platform gap for the next ISO, and it does not gate this engagement.
Reprice accordingly. The one thing their permission model does need is a **BDR rung** for
Cody (lead generation, appointments, statement requests, lead status), which the six-role
ladder does not have.

### Residuals are explicitly deferred — gap 3, demoted, but export is now mandatory

The doc argues residuals are "the reason they are buying software". The brief says the
opposite, in module 15: _"The CRM does not need to replace the residual tracker
immediately, but it must capture and export commission/revenue fields cleanly."_ They keep
the Excel GSP Portfolio Tracker; what they want from us is the fields (rep, BDR/source,
referral partner, split %, projected monthly revenue, approved date, installed date,
hardware recoup flag, bonus eligibility, processor, MID) **and a clean export**.

That converts a residual import/split/payout engine — the largest single build on our
list — into a fields-and-export job, which is an order of magnitude cheaper. Two caveats
to put in front of Eli rather than quietly accept: "not immediately" is not "never", and
their processor list (Micamp, CardConnect, Elavon, plus Micamp's First Data North,
FSP-Fiserv, FSP-TSYS, Maverick, Paya, Vericheck) is exactly the multi-format reconciliation
problem the doc described. Confirm whether this is phase 4 or out of scope, because the
answer changes how we shape the commission fields today.

### "AI" means something different to them than to us

Our ranked list led with a statement reader and an attrition watchdog. Their brief asks,
in order: **deal coaching** (a plain-English summary and next move per deal, with risk
flags), **call summaries** from uploaded transcripts, **objection prompts and competitor
battlecards**, and **a search assistant grounded strictly in approved GSP training
material**. The attrition watchdog they never mention — it needs the residual data they
just deferred. The statement reader is implied by module 6 but is never described as AI.

The last one is the surprise: _"AI answers should only pull from approved GSP
training/reference materials and should link back to the source resource"_ is retrieval
over a corpus we do not have, in a store we do not have (no `vector` extension, no
embeddings anywhere in the repo). It is a real build, and it sits behind module 17.

### Merchant accounts (MIDs) — gap 2, confirmed but lower

The brief treats MID as a single field (dedupe key, onboarding handoff, commission export)
rather than as a record with its own volume and residual. It stays worth building — the
commission export needs it and so does duplicate detection — but it is no longer the thing
everything else waits on. The custom-field bridge in the seed remains honest exactly as
long as a merchant has one MID.

## Module by module

| #   | Brief module                          | Status             | What it takes                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Executive Command Center              | **build**          | A real dashboard page in the empty `insights` category; thirteen tiles, all of them folds over deals/activities/tasks. Blocked on module 4's columns.                                                                                                                                                                                                               |
| 2   | Rep Home / Daily Game Plan            | **build**          | Same page mechanism, filtered to the signed-in rep. Ten tiles, same blocker.                                                                                                                                                                                                                                                                                        |
| 3   | Prospecting / lead intake             | **part**           | `companies` + `contacts` + `party_status` (lead/prospect/active/inactive) + the `prospects` view exist. Missing: lead source, lead quality, business type, estimated monthly volume, current processor, current POS/gateway, and **duplicate detection** — nothing in the schema stops two "Joe's Pizza" rows today.                                                |
| 4   | Sales pipeline                        | **config + build** | Their ten stages are per-org `pipeline_stages` rows — config. The fifteen required fields per open deal are the build (see below).                                                                                                                                                                                                                                  |
| 5   | Activity tracking                     | **part**           | `activities` has type/direction/duration/occurred_at and the polymorphic entity link. Its enum has six values (`note, call, email, meeting, sms, other`); the brief names thirteen kinds. Enum extension plus the roll-up that does not exist.                                                                                                                      |
| 6   | Statement / quote / proposal workflow | **part**           | `proposals` is the right shape (base case + priced options, `base_config`, `quick_plans` to fill an option in one click) and `proposal_status` already runs draft→sent→viewed→accepted. But **nothing sends a proposal**: there is no PDF, no share link, no email, and `proposal_events` has no code touching it. Statement upload needs documents (module below). |
| 7   | AI deal coaching                      | **build**          | The agent and its ten tools exist and are feature-gated. A coaching tool plus risk-flag derivation is a modest add — once module 4's columns exist, because every risk flag they list is a query over them.                                                                                                                                                         |
| 8   | Call recordings / transcripts         | **build**          | No table, no bucket, no path. Their own instruction is "do not overbuild": store the file and the transcript against a record, then summarise.                                                                                                                                                                                                                      |
| 9   | Objection handling coach              | **build**          | Content, not machinery — ten objection lanes and eight competitor battlecards. Rides module 17.                                                                                                                                                                                                                                                                     |
| 10  | Cadence engine                        | **build**          | Cheaper than it looks: stage-entry task sets are a trigger, and the 2-week/30/60/90 check-ins are tasks with future due dates. Only digests and sweeps need a scheduler we do not have.                                                                                                                                                                             |
| 11  | Referral partner module               | **mostly shipped** | The `referral-partners` view exists; `referred_by` already ships as a system relationship type with null endpoints, so "this merchant came from that bank" works today, both directions, with no schema change. Missing: partner type, commission status, next touch date, inactive alerts, and the production roll-up.                                             |
| 12  | Onboarding / Davey queue              | **build**          | Their eight onboarding stages are a second lifecycle with sixteen handoff fields of its own. A new record kind, auto-created when a deal reaches Approved.                                                                                                                                                                                                          |
| 13  | PCI workflow                          | **build**          | Small: status, due date, owner, reminder history, completion, escalation — hung off the merchant (or the MID when that exists).                                                                                                                                                                                                                                     |
| 14  | Rep scorecards                        | **build**          | A fold over module 5's activities plus deal outcomes. Cody's scorecard is a different cut of the same data, not a second mechanism.                                                                                                                                                                                                                                 |
| 15  | Commission / revenue attribution      | **build (small)**  | Eleven fields plus export. See the demotion above.                                                                                                                                                                                                                                                                                                                  |
| 16  | Win/loss intelligence                 | **build (small)**  | Six required-on-loss fields on the deal. `stage_outcome` already knows a stage is `lost`; nothing records why.                                                                                                                                                                                                                                                      |
| 17  | Learning / training resource centre   | **build (large)**  | Reference guides, proof library filtered by business type, product overviews, hardware library, rep training with completion tracking, and grounded AI search. The `library` nav category is empty for this vertical — that is where it goes.                                                                                                                       |

## What has to be built, ranked by whether the brief works without it

### 1. Deal discipline — their core rule, as columns

`deals` today is `title, amount, stage_id, pipeline_id, company_id, contact_id,
assigned_to, expected_close_date`. Their rule needs four columns that belong to **every**
vertical, not just this one — the CLAUDE.md test is whether two unrelated industries would
query on it, and a dentist chasing a treatment plan wants a next action as much as a rep
chasing a statement:

- `next_action text` and `next_action_due_at timestamptz`
- `last_activity_at timestamptz`, maintained by trigger from `activities` — the same shape
  as `tasks_sync_completion()` keeping `status` and `completed_at` honest
- `source` — an org-definable set, so **rows, not an enum** (the pipelines rule): their ten
  options include Seamless.AI and Instantly.ai, which are nobody else's vocabulary. On the
  company at intake, defaulted onto the deal, because one merchant can be worked twice from
  two channels.

Then the vertical's own fields — current processor, current POS/gateway, estimated merchant
savings, fee-elimination flag, pricing model, statement status, main objection — which are
this industry's and therefore **custom fields**, with one honest caveat: custom values are
rows, so a dashboard tile that filters on one is a join, not a column read. If the Command
Center needs to slice by current processor on day one, that field earns promotion to a
column.

Win/loss (module 16) is the same shape: `lost_reason`, `competitor`, `reopen_on`, plus
"was a statement collected" and "was a proposal sent", which are derivable rather than
stored.

**Enforcement goes in the form action, not a check constraint.** A hard constraint blocks
imports and any future API write, and the brief also asks for clean API access. Require the
next action when a deal moves stage, then make its absence impossible to ignore on both
dashboards — which is what "if a deal can sit quietly, the CRM failed" actually asks for.

### 2. The two dashboards

`src/routes/(app)/+page.svelte` is still the template's feature-card marketing page, and
nothing has ever been registered in the `insights` category. Both of their dashboards are
lists and counts over data we will have once (1) lands.

One decision worth making early: `views` — the cheapest surface we ship — only has
`company` and `contact` sources (`VIEW_FILTER_SCHEMAS`). Adding a **`deal` source** would
turn "stalled deals", "no next step", "proposals waiting on decision" and "approved not
installed" into migration rows rather than hand-written pages, and it benefits every
vertical. Recommend: add the deal source, then build the two dashboards as real pages that
compose those lists.

### 3. Documents — statements, application packets, proof files

Their Phase 1 includes document uploads, and today the only file mechanism in the repo is
`entity_images`, deliberately pinned by a check constraint to `entity_type = 'asset'` over
the private `entity-images` bucket, path `{org_id}/{entity_type}/{entity_id}/…`, which the
storage policies key off. The migration's own comment says widening that constraint is how
it is meant to grow.

Needed: statement uploads with **versions** (the brief says "multiple statement versions"),
the application packet with a required-documents checklist, and the proof/reference files
in module 17. Same bucket shape, one `documents` table, and the checklist per application.

**And the brief answers the sensitive-data question we were going to ask (Q26): "Last 4 of
tax ID only."** So no SSN column, no full tax ID, no bank details, and card numbers never.
That is a schema decision to write down and design to now, before the first merchant is
keyed in — the cheapest way to hold a line is to have nowhere to put the data.

### 4. Activity taxonomy and the roll-up

`activity_type` is `note | call | email | meeting | sms | other`. The brief's thirteen add
in-person visits, referral partner touches, statements collected, meetings booked,
presentations completed, proposals sent, applications sent, approvals, installs and support
issues. Extending the enum is trivial; the design question is that **half of those are
stage transitions**, and asking a rep to log "proposal sent" after dragging a card to
"Proposal Sent" is how activity data goes stale. Recommend a trigger that logs the activity
when the stage changes, so the scorecard is honest without double entry — and so
"rolls up automatically into rep scorecards" is true rather than aspirational.

### 5. The cadence engine

No scheduled jobs exist anywhere in the project (the only cron is a CI workflow that reaps
database preview branches). But most of what they describe does not need one: entering a
stage creates a task set, and "2-week, 30-day, 60-day, 90-day check-ins" are four tasks with
future due dates created at handoff. That is a `cadences` + `cadence_steps` pair and a
trigger on stage change — in-database, no infrastructure.

What genuinely needs a scheduler: overdue digests, the inactive-partner alert, and anything
that emails without a person clicking. Worth saying out loud before promising it, since
outbound email exists (`sendEmail()`, Resend) but nothing has ever run unattended.

### 6. Onboarding queue and PCI

A signed deal and a scheduled install are two lifecycles — theirs has eight stages of its
own and sixteen handoff fields that mean nothing on a deal. Build it as a new record kind
following the well-trodden checklist (one `crm_entity_type` value, a
`private.crm_entity_exists()` branch, a delete trigger, the table, a `src/lib/server/crm/`
module, `RECORD_KINDS` + `RECORD_KIND_META`, a `getRecord()` branch, the feature and pages
rows), auto-created by trigger when a deal reaches Approved — which is exactly what the
brief asks for.

PCI hangs off the same record: status, due date, owner, reminder history, completion date,
escalation flag. Small, and it is the difference between "an operational workflow" and the
note field they explicitly rejected.

### 7. The training / resource centre

The largest new surface, and the one with no precedent in the repo. It wants: reference
guides, a proof library filterable by business type, product overviews, a hardware library
with photos and install notes, rep training with per-rep completion, and AI search that
answers only from approved material and cites it.

Two pieces of good news. The **hardware library is `products`** — the catalog already has
kind, SKU, unit price, inventory and categories, and equipment photos need the same
`entity_images` widening as module 3. And permissioning comes free: a resource library is a
feature, so who can read it is a role grant, and a tool bound to that feature is withdrawn
from the model for anyone without it.

The rest is a `resources` table (kind, business-type filter, file or rich text, approval
state) plus, for grounded search, the vector store we do not have: the `vector` extension,
an embedding column, a chunking job and a retrieval tool. Real work, and worth phasing
exactly where they put it — last.

### 8. Export, API, and the quote tool

_"Do not build anything without clean export and API access."_ There is **no CSV export
anywhere in `src/`** today. Every list page uses the same `DataTable`, so one shared export
endpoint honouring the same filters and the same grants covers all of them at once —
worth doing early precisely because it is the brief's blanket condition. The API story is
Supabase's PostgREST under RLS, which is true but is not an answer to hand a customer;
decide whether we mean that or a documented app-level API.

Their quote tool (`quote.goldstandardprocessing.com`, Node/PDFKit on a Mac mini behind a
Cloudflare Tunnel) needs an early decision: **export to it, or absorb it.** Leaning absorb —
`proposals` is already the shape, and two quote systems means two fee schedules that drift.
But absorbing it means building proposal delivery (PDF or share link) which, as noted, does
not exist yet.

### 9. Communications sync

The first line of their own gap list is _"no centralized call/text/email/calendar sync"_.
We have outbound transactional email and nothing else — no inbound mail, no telephony, no
Google/Microsoft calendar sync. That is an integration workstream with real, ongoing cost,
and it is invisible in a feature list. Name it and price it separately.

## What the config migration should change today

All of this is rows — one migration, no behaviour change:

- **The board.** Their ten stages (Prospect, Contacted, Waiting on Statements, Presentation
  Scheduled, Proposal Sent, Application Sent, Underwriting, Approved, Installed/Live, Lost)
  replace the nine we guessed. Because pipelines are per-org, this is either GSP's own org
  setup or — better, and small — the industry-default-pipeline mechanism the migration's
  closing comment already sketches, next to `create_default_pipeline()`.
- **`deals` should be called "Deals", not "Applications".** We guessed wrong: their brief
  calls the record a deal throughout, and "Application Sent" is a _stage_. Two names for one
  thing on one screen.
- **`proposals` → "Proposals"**, not "Rate proposals" — their word, in module 6.
- **`tickets` → "Support issues"** to match the phrase they use in modules 5 and 12.
- **Vocabulary**: `proposal_presenter` → "Sales rep" and `proposal_responsible` →
  "Onboarding owner" are what the handoff fields in module 12 actually say. Worth one
  question rather than a guess (below).
- **A Prospector rung** (`…0007-000000000007`) for Cody: manage companies, contacts,
  calendar and tasks; read deals; no proposals.
- **Davey's rung** already exists as Onboarding Coordinator and needs `tickets: manage`
  added once PCI and the onboarding queue land.
- **`invoices` and `ledger` stay hidden.** The brief never bills a merchant — the hardware
  recoup flag is a commission field, not an invoice. That absence is now confirmed rather
  than assumed.

## Still open

The brief answers most of the discovery questionnaire. What it does not:

1. **Multi-location merchants** (Q9/Q10) — does one business ever carry several MIDs? This
   is the whole difference between a custom field and a record kind.
2. **Splits** (Q20) — flat per rep, per merchant, tiered? The commission fields cannot be
   shaped without it, even if the engine is deferred.
3. **Residuals: deferred or dropped?** (Q18–Q22) — "not immediately" needs a date attached.
4. **The quote tool** — export to it or absorb it, and who owns it if we absorb it.
5. **Proposal vocabulary** (Q7) — "Sales rep" and "Onboarding owner", or something else in
   the room?
6. **Statement turnaround** (Q23/Q25) — who computes the effective rate today, in what, and
   how long a rep waits. If capacity is the constraint, the AI statement reader moves up the
   list even though they never named it.
7. **Lead quality** — a scale we own (A/B/C) or their own set of rows, like lead source.

## Phasing, against theirs

Their Phase 1 is the honest starting point and it is mostly ours too: **the deal discipline
columns, the two dashboards, documents, the activity taxonomy, and export** — plus the
config migration above, which should go first because it costs a day and makes every demo
read in their language. Phase 2's cadence engine is cheaper than it looks and its stage-age
alerts fall out of `last_activity_at` for free; the referral module is nearly assembled
already; PCI and the onboarding queue are one record kind together. Phase 3 is where the
genuinely new machinery is — transcript storage, grounded retrieval, the training centre —
and it should be quoted as its own piece of work rather than folded into a CRM build.

Two things to keep out of Phase 1 whatever the enthusiasm: **grounded AI search**, because
it needs a corpus that does not exist yet, and **anything scheduled**, because nothing in
this project has ever run unattended.
