# Cadence engine plan

> Planning only. No scheduler, migration, notification rule, or application
> code is included here.

## Goal

Define repeatable follow-up sequences from business events and surface the next
due action in the notification inbox. The engine should support both deal
progress and post-live customer follow-up without becoming a second CRM.

## Core model

- **Cadence** — an organization- and industry-aware named sequence.
- **Trigger** — the event or state that starts it, such as entering a deal stage,
  sending a proposal, sending an application, or reaching `live_at`.
- **Step** — a relative delay, condition, recipient policy, action type, and
  message template.
- **Occurrence** — one concrete scheduled step for one deal, onboarding record,
  or customer; it records due, completed, skipped, suppressed, or failed state.

Occurrences must have an idempotency key so retries never create duplicate work.
Every occurrence stores the source event, target record, due time, timezone,
recipient, and completion evidence.

## Initial sequences

### Deal follow-up

- Stage has not moved: day 1, day 3, and day 7 reminders.
- Waiting on statements: request, escalation, and stop/suppress conditions.
- Proposal sent: follow-up steps with a clear response or cancellation path.
- Application sent or underwriting delayed: owner reminders and escalation.

### Post-live follow-up

At activation, create two-week, 30-day, 60-day, and 90-day check-in
occurrences. These belong to the separate post-implementation Follow-up Pipeline;
the cadence engine schedules the work but does not own the customer lifecycle.

## Notification integration

Each actionable occurrence writes an in-app notification through the existing
server-side inbox path. Notifications need a type, source occurrence, target
record, due time, urgency, and filterable metadata. Internal reminders and
client-facing messages must be separate delivery policies; no client message is
sent automatically in the first phase.

## Rules and safety

- Suppress a step when the deal leaves the triggering stage, is won/lost, or is
  explicitly paused.
- Deduplicate by cadence version, target record, trigger event, and step.
- Respect organization timezone, quiet hours, membership, and permissions.
- Record skipped and suppressed steps rather than deleting them.
- Keep templates industry-aware but allow organization overrides.
- Require human review before email, SMS, stage changes, or other external writes.

## Rollout

1. Read-only cadence definitions and occurrence preview.
2. Internal task and notification creation for one deal-stage cadence.
3. Completion, snooze, suppression, retry, and audit history.
4. Proposal/application and post-live check-in cadences.
5. Industry packs and optional client-facing delivery.

## Open decisions

- Which roles may create or edit cadences?
- Whether stage aging uses last stage transition or last activity.
- Exact client-delivery channel and consent model.
- Whether organization overrides require versioning and effective dates.
