# Backlog

Everything discussed so far, in one list. Each section says what the thing is,
where it stands, and the concrete steps to finish it. A section that already has
a plan document links to it rather than repeating it.

Status key: **Planned** (plan doc merged, nothing built) · **Drafted** (code or a
migration exists somewhere but is not merged) · **Idea** (discussed only) ·
**Ready** (small and well understood, can be picked up as-is).

---

## 1. Quick wins

Small, self-contained, no dependency on anything else in this list.

### 1.1 Staff and Settings must appear together in the user menu — **Done**

Fixed in #153: `SettingsSidebar` and `AssistantSidebar` now derive
`userMenuItems` from `userMenuNav(page.data.nav ?? [])` and pass it to
`NavUser`, same as `AppSidebar`. Covered by `navigation.test.ts` and
`tests/auth.spec.ts`.

### 1.2 Hourly wage and commission percentage on staff — **Ready**

- [ ] Migration adding `hourly_wage numeric` and `commission_percent numeric` to
      the member/staff record, with check constraints (wage `>= 0`, percent
      `0–100`).
- [ ] Decide the read boundary: pay is not roster data. Gate both columns behind
      owner/admin (or a dedicated level) with column-level grants, so a member
      reading the roster never receives them.
- [ ] `npm run db:types` and commit the regenerated `src/lib/database.types.ts`.
- [ ] Surface them on the staff page and in the record form; money renders
      through the existing `money` field type.
- [ ] Tests for the new policies and for the form action.

---

## 2. Deals

The largest cluster. Order matters: stages, then fields, then history, then the
AI tools that read the history.

### 2.1 Payment-processing pipeline stages — **Drafted** (mechanism built; not yet a live PR)

Turned into a general mechanism rather than a one-off migration, once it
became clear the seed data already hand-built this exact funnel per org
(`supabase/seed.sql`, before this) — org-by-org replacement was always meant
to be a fixture's workaround, not the shape.

`industry_pipelines` (name/description) and `industry_pipeline_stages`
(`20260919110000_industry_pipeline_stages.sql`) are the `industry_custom_fields`
shape applied to pipelines: an industry ships a funnel, and `create_default_pipeline()`
copies it in at org creation instead of the generic six-stage board — falling
back to that same generic board for an industry that ships none. Shipped for
`merchant-services` (the ten stages below) and, as a second proof the
mechanism generalizes, `real-estate` (the seven stages `seed.sql` already had
for Ironwood/Larkspur). **Deliberately create-time only, no backfill and no
re-apply on an industry switch** — a deal already sitting in a stage is not
something a later industry-catalog change may silently move or orphan; an
existing org's board is its own from the moment it exists, exactly as
`pipelines` being rows rather than an enum already implied.

- **Prospect** (open) → **Contacted** (open) → **Waiting on Statements**
  (open) → **Presentation Scheduled** (open) → **Proposal Sent** (open) →
  **Application Sent** (open) → **Underwriting** (open) → **Approved** (open)
  → **Installed / Live** (won) / **Lost** (lost)

- [x] Migration: `industry_pipelines` + `industry_pipeline_stages` tables,
      `create_default_pipeline()` rewritten to read them (falling back to the
      original six stages), seeded for `merchant-services` and `real-estate`.
- [x] Preserves orgs that already customized their board — the function only
      runs once, at org creation; no backfill loop, no trigger on `industry_id`
      changing.
- [x] Matches `buildDealColumns()` already: `Installed / Live` and `Lost` are
      the only two terminal stages here (won/lost respectively), so they share
      the one Closed column with a drop zone each — no separate `Denied` stage
      (a denied application is `Lost`), and `Installed`/`Live` merged into one
      stage rather than two, matching what `seed.sql` had already proven out
      rather than the finer 12-stage split first discussed.
- [x] `probability` set per stage (5 → 90 climbing through the open stages).
- [x] `seed.sql` simplified: the old per-org rename/replace/delete dance for
      Keystone Payments, Cobalt Merchant Services, Ironwood Property Group and
      Larkspur Rentals is gone — the trigger now produces the same board on
      insert.
- [ ] **Not done**: opening this as its own PR (it's bundled into the deal
      timeline PR, #162, for now — pull it out if that PR should stay
      narrower). Not run through a live `db:reset` in this session (see the
      same Docker caveat on §2.3) — verify before merging.

### 2.2 Deal object fields — **Idea**

Discussed as a list; still needs sorting into real columns vs. custom fields vs.
relationships. Proposed classification to confirm:

- **Relationships, not columns** — rep and owner are both members. `assigned_to`
  stays a column only if genuinely single-valued; a rep _and_ an owner means two
  named roles, which is the `proposals` presenter/responsible pattern
  (composite key onto the membership) rather than two ad-hoc columns.
- **Universal columns** — next action (text), next action due date, last
  activity date, expected close date, projected value (noun renamed per industry
  through `terms`, so it is not "monthly revenue" everywhere).
- **Source** — points at a contact _or_ a company, so it is a relationship, not
  an `owner_id`-shaped column that has to pick a kind.
- **Payment-processing custom fields** — current processor, current POS/gateway,
  main objection, statement status, proposal status, application status. These
  ship through `industry_custom_fields` so every org in the vertical gets them.

Tasks:

- [ ] Write the plan doc that fixes the above classification.
- [ ] Confirm `last_activity_date` is derived from the timeline rather than a
      column anyone can type into (see §2.3).
- [ ] Add the universal fields to `RECORD_FORMS` + `writeRecord()` +
      `recordFormValues()`.
- [ ] Add the vertical's fields to the `industry_custom_fields` migration with
      `list_shown` / `list_searchable` / `list_filterable` set deliberately.
- [ ] Decide which of these become list columns (`list_fields` /
      `industry_list_fields`) for the deals list.

### 2.3 Unified deal timeline — **Drafted** (stage/owner slice built; the rest is not)

Plan: [`unified-deal-timeline-plan.md`](./unified-deal-timeline-plan.md).

Settled shape: no second table. The timeline **is** `activities` — system facts
(stage change, owner change, document events, proposal/application milestones,
promotion, cadence steps) are logged as `activities` rows with a system `type`,
the acting member still as `author_id` for attribution — `is_system`
(generated from `type`) is what makes a row uneditable, not a missing author.
`Detail.Activity` already renders it; no combined reader across two tables.

- [x] Extended `activities.type` with `stage_changed` / `owner_changed`; added
      a `metadata jsonb` column and a generated `is_system` column
      (`20260919100000_deal_activity_types.sql`,
      `20260919100100_deal_timeline_system_activities.sql`). Written without a
      local Docker/Postgres, so `src/lib/database.types.ts` was hand-edited to
      match — CI's `database` job (`db:lint` + `db:types:check --local`) has
      since replayed both migrations against a real disposable Postgres and
      passed, confirming the hand-edit is correct.
- [x] `updateDeal()` (`src/lib/server/crm/deals.ts`) logs a `stage_changed` /
      `owner_changed` activity itself when those columns change, so the move
      action and the generic edit form both get it for free.
- [x] `Detail.Activity` (`src/lib/components/detail/detail-activity.svelte`)
      draws the two new kinds with their own icon and label.
- [x] Unit tests for the new logging (`deals.test.ts`), `logSystemActivity()`
      (`activities.test.ts`) and `getStageName()` (`pipelines.test.ts`).
- [ ] Document uploaded/linked/removed, proposal sent, application sent,
      promotion into onboarding, cadence step fired — each is its own
      `logSystemActivity()` call at the write that already exists (or, for
      promotion/cadence, at the write §2.4/§4.1 add), not built yet.

### 2.4 Deals without a party, and promotion — **Idea**

A deal can be created with its own information and need not be attached to a
person or a company yet; later it is **promoted** into onboarding.

- [ ] Plan doc: what a party-less deal is, and what promotion does.
- [ ] Define the required-fields gate — promotion is refused until the
      vertical's onboarding fields are filled in (§3.1).
- [ ] Promotion writes a system event (§2.3) and creates the onboarding record.

---

## 3. Lifecycles after the deal

### 3.1 Onboarding pipeline — **Planned**

Same bones as deals, different stages, its own lifecycle — not extra deal
stages. Payment-processing stages: Approved → Install Scheduled → Equipment
Shipped → Install & Training Complete → PCI Setup → Live.

Fields captured at promotion (payment processing): merchant name, install
contact name / phone / email, processor MID, equipment POS gateway, virtual
terminal needs, install type (in-person or remote), equipment shipped, target
go-live date, business hours, PCI status, last four of tax ID, notes, sales rep
owner, onboarding owner (both members).

- [ ] Decide whether onboarding reuses `pipelines` + `pipeline_stages` with a
      second board, or earns its own table. Reuse is the default unless a real
      difference appears.
- [ ] Migration for the vertical's stages and its required promotion fields.
- [ ] Last four of tax ID is sensitive: narrow column grants, and never in a list
      column or a search index.
- [ ] Two owners (sales rep, onboarding owner) follow the proposals
      presenter/responsible pattern.

### 3.2 Follow-up pipeline — **Planned**

Post-live customer check-ins at two weeks, 30, 60 and 90 days. A distinct
lifecycle from onboarding; the cadence engine (§4.1) schedules the work but does
not own it.

- [ ] Plan doc section defining the boundary between onboarding and follow-up.
- [ ] Decide what a follow-up record _is_ — a lifecycle on the customer, or
      scheduled occurrences with no record of their own.

---

## 4. Automation and intake

### 4.1 Cadence engine — **Planned**

Plan: [`cadence-engine-plan.md`](./cadence-engine-plan.md) and
[`notifications-plan.md`](./notifications-plan.md).

- [ ] Migration for cadence / trigger / step / occurrence, with the idempotency
      key on occurrences.
- [ ] The scheduler itself — decide where it runs (cron, queue, DB job) before
      building anything on top.
- [ ] Wire occurrences into the existing notification inbox with a `type` that
      lets people filter.
- [ ] Deal sequences: stage not moving (day 1/3/7), waiting on statements,
      proposal sent, application sent / underwriting delayed.
- [ ] Post-live sequences feeding §3.2.
- [ ] Client-facing messages are a later phase — internal notifications first.

### 4.2 Quote intake workflow — **Planned**

Plan: [`quote-workflow-plan.md`](../quote-workflow-plan.md). Distinct from
proposals: an inbound request for pricing, often arriving from third-party tools
or linked websites, with file uploads and a description.

- [ ] Migration: quotes table with received date, source, status (untouched →
      responded), and the vertical's captured fields.
- [ ] File uploads — depends on §5.1's storage decisions.
- [ ] A quotes list page + record page using the generic layer.
- [ ] Intake endpoint for third-party/website submissions, with abuse controls
      and no authenticated session.
- [ ] Responding with real pricing; a client portal is a later phase.

### 4.3 Drive-style file storage — **Planned**

Folders on Supabase Storage, files inside them. Deliberately simple.

- [ ] Plan doc for the folder model (a tree table, or path prefixes) and RLS on
      the storage bucket.
- [ ] Decide the link to records — is a file attached to a deal, or does it live
      in a folder that a deal points at?
- [ ] Upload, browse, rename, move, delete; a file event lands on the timeline
      (§2.3).
- [ ] MIME/size limits and virus-scan posture before anything is public.

---

## 5. AI tools

All three are planning-only and all three read the same history, so §2.3 lands
first. Each is a tool under `src/lib/server/ai/tools/` — one file, a `ToolAccess`,
one line in each map in `tools/index.ts`, a label, and a `sourcesOf()` case.

### 5.1 AI deal coaching — **Planned**

Plain-English summary of an active deal plus the recommended next move: pain
points, current processor/POS, main objections, decision maker and their status,
promised follow-ups, best next action, suggested call script, suggested
text/email follow-up, and risks.

- [ ] Risk rules, stated generically rather than per-vertical: no next step set,
      no activity in N days, waiting on an input too long, document sent with no
      response, stalled at a stage, approved but not progressed.
- [ ] Derive the risks from available data so the tool works for any industry,
      with the vertical only supplying wording.
- [ ] `outputSchema` shaped as an artifact the record page can draw.
- [ ] Decide whether it is generated on demand or cached per deal.

### 5.2 AI objection-handling coach — **Planned**

Quick prompts before, during and after calls. Universal objection lanes — "just
send me an email", "I already have a guy", "the rates are fine", "bad timing",
"contract buyout" — with per-industry context.

- [ ] Where industry context comes from: a `terms`-style table rather than
      constants in `src/`.
- [ ] Decide the surface — a tool in the thread, or a panel on the deal page.

### 5.3 AI win/loss intelligence — **Planned**

Depends on §2.3. Reads outcomes across deals to say what is working.

- [ ] Outcome fields: lost reason, competitor, main objection, what would have
      changed it, whether a proposal was sent, whether a statement was collected,
      stage reached.
- [ ] Guard against conclusions drawn from thin data — say so rather than
      inventing a trend.
- [ ] Aggregate reporting view, not just a per-deal answer.

---

## 6. Platform administration

Plan: [`platform-administration-plan.md`](./platform-administration-plan.md).
**Status: Planned; a separate implementation PR exists but contains code and has
merge conflicts — it was deliberately not merged.**

Settled decisions: not an industry; a `(admin)` route group with its own shell,
sidebar and helpers; entry from a divided section of the existing org picker;
gated on `system_admins` server-side on every route and action; the org picker
keeps meaning "which organization", and admin pages get their own target-org
selector where they need one.

- [ ] Resolve or abandon the existing implementation PR — decide before building.
- [ ] `canEnterPlatformAdmin` flag in the app load, used only to decide whether
      the picker renders the Platform section.
- [ ] `(admin)` route family + its own layout; no tenant sidebar, feature
      registry or industry vocabulary inherited.
- [ ] Server-side `system_admins` check on every admin route and endpoint.
- [ ] Audit log for every admin action — this is what replaces "we changed it by
      migration and the migration is the record".

First pages, read-only, in this order:

- [ ] Admin home with cards.
- [ ] Organizations list (name, industry, tier, created).
- [ ] Tiers list (id, name, org count, enabled feature count).
- [ ] Organization detail (tier, industry, members, overrides).
- [ ] Then exactly one controlled edit: change an organization's tier, as a
      server-side admin action — never browser write access to reference data.

Deferred on purpose: role editor, feature editor, industry editor, system-admin
manager.

---

## 7. Everyday product features

Brainstormed for the app's own users, none planned yet. Roughly in the order
they were judged valuable.

- [ ] **My Work / Today** — one personal page: overdue tasks, today's calendar,
      assigned tickets, deals needing follow-up, recently opened records. Judged
      the highest-value simple feature; reuses records that already exist.
- [ ] **Universal search** — extend the existing ⌘K palette, which today only
      finds pages and settings. Keep page results, add grouped record results
      (Companies, Contacts, Deals, Tasks). Not a second search surface.
- [ ] **Client 360 timeline** — deals, tasks, tickets, notes, proposals and
      activity together on a company/contact page. Overlaps §2.3; do that first.
- [ ] **Saved views and filters** — "My open deals", "Tickets waiting on us".
      The views system already has the filter shape; per-org saved views were
      always the planned next phase.
- [ ] **Recurring tasks and templates** — repeatable work as a checklist or a
      repeating task.
- [ ] **Comments and mentions** — `Detail.Thread` already exists; joining is a
      branch in `hasThread()` plus the two comment actions, not a new component.
- [ ] **Notifications and reminders** — assignments, due dates, mentions, ticket
      updates. Overlaps §4.1.
- [ ] **Bulk actions** — owner, status, due date, tags across selected rows.
- [ ] **Simple reporting** — pipeline value, tickets by status, workload by
      person, completed work over time.

---

## Dependency order

1. §1 quick wins — independent, do any time.
2. §2.1 stages → §2.2 fields → §2.3 timeline.
3. §2.3 timeline → §5 AI tools (all three) and §7's client 360.
4. §2.4 promotion → §3.1 onboarding → §3.2 follow-up.
5. §4.1 cadence engine → §3.2's check-ins.
6. §4.3 storage → §4.2 quote uploads.
7. §6 admin console is independent of everything above; its blocker is deciding
   what to do with the existing conflicted PR.
