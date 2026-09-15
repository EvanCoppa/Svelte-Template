# Unified deal timeline

## Goal

Give every deal one trustworthy chronological view of what happened.

The timeline should support day-to-day follow-up now and later provide reliable
evidence for win/loss intelligence, coaching, and reporting.

## Decided model

No second table. The timeline **is** `activities` — the same table and the same
`Detail.Activity` rendering every other record already uses. System-generated
facts (stage transitions, owner changes, proposal/application status changes,
documents uploaded/linked/removed, promotion into onboarding, cadence
milestones) are logged as `activities` rows too, written server-side alongside
the write that caused them, with a `type` that marks them as system-generated
(as opposed to a note/call/email/meeting/text a person logged).

This drops the earlier append-only system-event table idea: two tables feeding
one reader was extra machinery for a distinction (`activities` vs. "system
events") that the existing `type` column already expresses.

A system row keeps the acting member as `author_id`, exactly like a
human-logged one — the deal board's drag is still someone's own action, and a
reader wants to know who moved it. What makes a row **uneditable** is not a
missing author; it's `is_system`, a column generated from `type` (the same
shape `relationship_types.is_system` already uses), which the update/delete
policies exclude outright. Because it's derived from a closed vocabulary of
`type` values rather than a flag a request can set, nothing posted from the
browser can mark its own row permanent.

## What changed on `activities`

- `type` gained the system-generated kinds — `stage_changed` and
  `owner_changed` so far — alongside the existing human kinds
  (note/call/email/meeting/sms/other). More join the same way: a migration
  adding the enum value and widening `is_system`'s generated expression.
- `metadata jsonb`: structured before/after values (`{"from": "<id>", "to":
"<id>"}`) for a system row; null for a human-logged one.
- `is_system boolean generated always as (type in (...)) stored`: true for a
  system-generated kind. The update and delete policies now require
  `not is_system` in addition to their existing author/owner-admin check, so a
  system row is never edited or corrected in place — a mistake is a later
  event, the same rule `on_crm_entity_deleted` already gives a taggings row.
- Same organization/record RLS otherwise; no new policies for insert or
  select, and no new grant beyond adding `metadata` to the columns a member
  may set.

Migrations: `20260919100000_deal_activity_types.sql` (the two enum values, in
their own transaction so the second migration can reference them) and
`20260919100100_deal_timeline_system_activities.sql` (the columns, the
policies, the grant).

## First implementation slice — done for stage and owner

1. ~~Confirm `activities.type` can take the new system kinds and check whether
   a jsonb detail column already exists on the table for before/after
   values; add one if not.~~ Done — see the two migrations above.
2. ~~Insert an `activities` row for deal stage changes … including the
   previous and next stage.~~ Done, and owner changes (`assigned_to`) too:
   `updateDeal()` in `src/lib/server/crm/deals.ts` reads the row before an
   edit that touches `stage_id` or `assigned_to`, and calls
   `logSystemActivity()` (`src/lib/server/crm/activities.ts`) for whichever
   changed — so the pipeline board's drag and the generic record-edit form
   both get it for free, with no second call site.
3. Insert one for document-link and proposal/application milestones where
   those writes already exist. **Not done** — documents have no write path
   yet (§4.3 in the backlog), and the proposal lifecycle's own actions
   (`billing.server.ts`-shaped) don't call `logSystemActivity()` yet.
4. ~~Render the system kinds in the existing timeline with their own
   icon/label, keyed off `type` the way every other kind already is.~~ Done —
   `src/lib/components/detail/detail-activity.svelte`'s `ICONS` map and
   `labelFor()`.
5. ~~Tests: ordering, permissions, and that a system row is never editable.~~
   Unit tests cover the write side (`deals.test.ts`, `activities.test.ts`,
   `pipelines.test.ts`) — a change is logged, an unchanged tracked column logs
   nothing, and the exact row shape `logSystemActivity()` inserts. The two
   migrations themselves were hand-written without a local Postgres (no
   Docker in that session, so `database.types.ts` was hand-edited to match)
   — CI's `database` job has since replayed both against a real disposable
   Postgres and confirmed `db:lint` and `db:types:check` both pass, so the
   hand-edited types file is now known to match the schema exactly. Still not
   covered by anything in this repo (no pgTAP suite): a positive assertion
   that an owner/admin cannot update or delete a system row — CI proves the
   migrations apply and the types match, not that the policies behave.

## Design guardrails

- Do not turn every database mutation into an activity; only changes that help
  explain customer progress, ownership, risk, or outcome belong there.
- Keep activity logging user-friendly and fast; do not require reps to duplicate
  events already generated by a stage or document action.
- Keep the timeline organization-scoped and permission-filtered server-side.
- Avoid claiming causation from the timeline alone; analytics should show sample
  size, time window, and missing-data rates.

## Open decisions

- `type` values for the remaining system kinds (document events, proposal
  status, promotion, cadence) — and each needs `is_system`'s generated
  expression widened in its own migration when it lands.
- Whether field changes beyond stage/owner need their own `type` or fold into
  a generic "field changed" kind with metadata.
- Retention/export requirements, if any, beyond what `activities` already has.
