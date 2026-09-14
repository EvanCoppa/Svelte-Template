# Notifications: a bell in the header, over a table that was already there

`notifications` has existed since the `crm_core` migration: one row addressed to one
member, created server-side through the service-role client, carrying a `type`, a
`title`, an optional `body` and an app-relative `link`. It had a data module, a test
file and three recipient-only policies — and nothing ever drew it.

This is the surface for it, plus the five columns that reading a stream of them turned
out to need.

## What is not here

- **Notifications are not a feature.** No `features` row, no `pages` row, no nav entry,
  no grant. The bell is shell chrome like the theme toggle beside it, and a
  notification is addressed to a _person_ rather than filed under a capability, so
  `featureGateFor()` has nothing to answer about one. That is also why
  `$lib/server/notifications` has no equivalent of `requireNoteAccess()`.
- **No realtime.** The panel draws what the last load fetched, and a write refreshes it
  through `QUERY.notifications`. Supabase Realtime on this table is a reasonable later
  phase and changes nothing below it: the rows, the query key and the panel all stay.
- **No delivery channels.** `sendEmail()` is a separate thing; an in-app notification
  and an email about the same event are two writes by the same action, not one row with
  a fan-out.

## The five columns

`supabase/migrations/*_notification_inbox.sql`. Each answers a question that a `title`
alone cannot, and each is a column rather than a `jsonb` payload because the panel reads
every one of them on every render and three of them filter the query.

| Column         | The question            | Notes                                                |
| -------------- | ----------------------- | ---------------------------------------------------- |
| `actor_id`     | Who did it              | → `profiles`, so the embed can name and picture them |
| `channel`      | Which stream            | `inbox` / `general`, an enum                         |
| `context`      | What about              | The word after the timestamp: "Risk", "RQ1001"       |
| `action_label` | What to do              | The button's words, or null for a statement          |
| `archived_at`  | Whether it is done with | Distinct from `read_at` — see below                  |

`type` stays exactly what it was: a free-text discriminator for code that cares what
happened. **Nothing on screen reads it**, so a new kind of notification needs no
migration and no `switch`.

### Seen is not dealt with

`read_at` and `archived_at` are not two ways to say the same thing, in the same way
`tasks.status` and `tasks.completed_at` are not (docs/tasks.md). Reading something is
what stops it shouting; putting it away is what takes it off the list. One rule ties
them, and it lives in `notificationColumns()`: **dismissing marks it read**. Without
that, restoring an archived row would drop it straight back into the unread badge.

### The two streams

`inbox` is what is addressed to you — somebody needs you, somebody acted on your work.
`general` is what merely happened around you — a rule changed, a plan limit is close.
Mixing the two is how an inbox becomes something people stop opening, and the split is
an enum rather than a lookup table for the reason CLAUDE.md gives: a vertical does not
get to invent a third stream.

**Archived cuts across both.** A general notification you dismissed is in Archived, not
in General — which is why `notificationTab()` checks `archived_at` first.

## Where the rows come from and where they go

- **Written** by `createNotification()` in `src/lib/server/crm/notifications.ts`, on the
  service-role client, from the form action or endpoint that caused the event. The five
  columns are all optional: a caller that names none of them writes exactly the
  notification this table held before.
- **Read** by `loadInbox()` in `src/lib/server/notifications.ts`, called once in the
  `(app)` layout load. Two capped queries in parallel — the open rows (30) and the
  archived ones (15) — concatenated into one array the panel splits again by pile. Two
  queries rather than one so a reader who dismissed two hundred things last month
  cannot push today's out of the window.
- **Refreshed** by `QUERY.notifications`. The shell's load owns the rows, so one
  `invalidate` redraws the list, the tab counts and the dot on the bell together.

### The title is the rest of the sentence

A row reads `**Evan Coppa** assigned you a ticket`, so when a notification has an actor,
its `title` is written as the predicate — `'assigned you a ticket'`, not `'Evan
assigned you a ticket'` and not `'Ticket assigned'`. The panel puts the name in front.
Actor-less notifications are whole sentences on their own: `'Invoice INV-1002 is past
its due date'`.

## The writes are an endpoint, and why

Everything the reader can do to a notification is a `PATCH` to
`src/routes/api/notifications/`, through `notificationCommands` in
`$lib/notifications-api`. This is CLAUDE.md's cross-page-mutation exception, taken for
the same reason the note dock takes it: the bell floats over every screen, so there is
no page action to post to and no form to post.

- `PATCH /api/notifications/[id]` — `{ read?, archived? }`. No org id and no membership
  check: the policies are `user_id = auth.uid()`, so a caller can only name their own
  row, and one they cannot see comes back from `.single()` as a row that is not there.
- `PATCH /api/notifications` — `{ read: true }`, "Mark all as read" for the active org.
  A `z.literal(true)`, because there is no such thing as marking everything unread.

The active org is a **filter, never a permission** (CLAUDE.md, "the active org is a
cookie"): a forged cookie yields rows the caller was entitled to anyway, which is what
lets these endpoints read `locals.activeOrgId` instead of paying for the org-context
round trip the notes endpoints need.

Column grants are the backstop: `authenticated` may update `read_at` and `archived_at`
on this table and nothing else, so no endpoint bug can rewrite a notification's text.

## The panel

`src/lib/components/notifications/`, opened from a popover the app header owns.

The **trigger stays in `app-header.svelte`** so it wears the same `.icon-btn` as the
theme toggle and log out — three pieces of header chrome that should look and behave
alike — and the component owns what is inside. The bell wears a **dot, not a number**:
the count belongs on the tabs, where it also says which pile it is in.

Three tabs, `underline`, drawn from `NOTIFICATION_TABS`. One row component draws every
pile, because an unread ask and a month-old archived row differ only in their columns.
A row has **one** way to dismiss, chosen by whether it asks anything: a notification
with an `action_label` is a question and spells out both answers ("Dismiss" beside
"Review"), everything else keeps a quiet × in the margin next to the unread dot.

**Leaving the panel starts the breadcrumb trail over**, exactly as the ⌘K palette, the
sidebar and the note dock do (CLAUDE.md, "Navigation"): a jump out of a shell surface is
depth 1, not a step deeper into whatever page happened to be underneath. That is why the
rows are buttons calling `jumpTo()` rather than links.

### The clock is the browser's

"36 mins ago" is a wall-clock phrase, so the server ships instants and
`$lib/notifications` turns them into words — with `now` passed in, never read inside, so
the same call is the same answer on both sides of hydration and a test can say when
"now" is. It is the rule `taskBucket()` and `dueLabel()` follow (docs/tasks.md). The
panel re-reads its clock once a minute while it is open, so a row that said "Just now"
does not still say it five minutes later.

## Switching the General stream off

`notifications.general` is an account preference (docs/user-preferences.md) — the
account axis, because it is how one person wants to read, not what the organization
has. It is the first preference in the registry with **no `feature`**, which is exactly
what a switch for shell chrome should be: offered to every org.

Off, it hides the General tab _and_ stops that stream counting on the bell — a badge for
a tab you cannot open is how people learn to ignore badges. It does not change what is
fetched: the same two queries run either way, the same way the notes dock's rows are
fetched whether or not the rail is drawn. Hiding a tab hides the tab; nothing is
deleted, and it all comes back when the switch goes back on.
