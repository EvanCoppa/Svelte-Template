# Notifications plan

> Planning only. This document describes the notification layer and its future
> relationship to cadences; it does not add code or schema changes.

## Purpose

Keep one in-app inbox for work that needs attention while preserving a clear
distinction between a notification, an activity on a CRM record, and a scheduled
cadence occurrence.

## Notification contract

Each notification should identify:

- recipient and organization scope
- type and human-readable title/body
- source event or occurrence
- related deal, onboarding record, task, document, or other CRM entity
- created time, due time, read time, and archive time
- urgency and filterable metadata
- optional actor and deep link

The server creates notifications after authorization checks. Clients may read,
mark read, archive, and filter their own inbox, but may not rewrite notification
meaning or recipient ownership.

## Relationship to the timeline

An important notification can link to a deal timeline entry, but the two are not
the same record. The timeline records what happened; the notification records
who needs to act. Dismissing a notification must not erase the underlying
activity, system event, or cadence occurrence.

## Relationship to the cadence engine

Cadences create notifications for concrete occurrences. The notification stores
the occurrence ID and source event so retries are safe and the user can see why
the reminder exists. Completion or suppression updates the occurrence and may
close or replace the notification; it never silently removes history.

## MVP experience

1. Header bell with unread count.
2. Inbox tabs for actionable, general, and archived items.
3. Read, archive, and deep-link actions.
4. Filters by type, urgency, source, and related record.
5. Clear empty, stale, and permission-filtered states.

Defer email/SMS delivery, complex preferences, digest scheduling, and client
notifications until the internal inbox and occurrence model are reliable.

## Security and reliability

- Enforce recipient and organization scope server-side and through RLS.
- Make notification creation idempotent for retries and duplicate events.
- Never place secrets, full payment data, or sensitive application payloads in
  notification text.
- Preserve an audit trail for high-impact notification actions.
- Add quiet hours and channel consent before any external delivery.

## Phases

1. Stabilize the in-app inbox contract and filters.
2. Connect one deal cadence to internal notifications.
3. Add occurrence completion, snooze, suppression, and retry behavior.
4. Add post-live check-ins and industry-specific notification types.
5. Design external delivery and client portal notifications separately.
