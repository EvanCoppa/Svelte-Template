# Calendar: the schedule, dragged into place

The brief was a calendar that feels like the good ones — click an empty hour and
something is booked there, drag a block and it moves, pull its bottom edge and it grows,
switch between a month, a week and a day without the page flinching — built on this
repo's rules rather than around them. It is a feature like any other (`calendar`, route
`/calendar`), a table like any other, and every write goes through a form action. What
is new is a fair amount of geometry, and this page is where it is written down.

## Why `calendar_events` is its own table

The activities and notes migrations already told two kinds of "something written down"
apart; an event is the third, and it is neither:

| An activity                         | A note                         | An event                             |
| ----------------------------------- | ------------------------------ | ------------------------------------ |
| A **moment** that happened          | A **document** that stays open | A **block of time** that is planned  |
| Logged after the fact, never edited | Edited for weeks               | Moved and stretched until it is over |
| `occurred_at`                       | `body`, `archived_at`          | `starts_at`, `ends_at`, `all_day`    |

It is not a task either: a task is _due_, an event _occupies_. Folding appointments
into `tasks.due_at` would make every visit a to-do that can be "completed" and every
to-do a block on the grid, so the table is its own, with a start **and** an end.

## The table

`supabase/migrations/*_calendar.sql`. The canonical tenant shape with the tasks
extension — member-writable working data, owner/admin delete, column grants keeping
`org_id` and `created_by` out of the browser's reach — plus:

- **`starts_at` and `ends_at` are instants, and `ends_at` is exclusive.** A 9:00–10:00
  meeting ends at 10:00 sharp; an all-day event on the 10th runs from local midnight on
  the 10th to local midnight on the 11th, the way iCalendar's `DTEND` does. That one
  convention is what makes "overlaps this range" a single comparison
  (`starts_at < to and ends_at > from`), a multi-day event one row, and a resize a change
  to one column.
- **`all_day` says how to draw it, not how to store it.** Both instants are still set.
- **`entity_type` + `entity_id`**, the shared polymorphic link, nullable: the patient the
  appointment is with, the deal the demo is closing, or nobody. Nothing points _at_ an
  event — it is not a `crm_entity_type`, has no record page and no list row, because an
  event is read where it is drawn. Deleting the record an event is for **detaches** the
  event (one branch in `on_crm_entity_deleted()`): the consultation still happened.
- **`assigned_to`** is a membership, through the same composite foreign key as
  `deals.assigned_to`, so nobody outside the org can be named and leaving clears it.
- **`color public.badge_tone`**: the ten tones the app owns, nothing new.

## Registration

One `features` row (`calendar`, icon `calendar-days`, first in the CRM section — the
schedule is the screen a working day opens on), one `pages` row with a null title,
`industry_features` for every industry, `tier_features` for every tier, and
`role_permissions` derived from **tasks**: whoever schedules the follow-ups schedules the
visits, at the same level. The two industries that book people rather than jobs say it
in their own words — a practice has a **Schedule** of **appointments**; everyone else
inherits "Calendar" / "event" — so `featureTerms(page.data.terms, 'calendar')` names the
"Add …" button and every toast (see [features.md](features.md), "Names by industry").

## Time is local, and the server knows it isn't

A calendar is a wall-clock instrument: the 9:00 a booking says is the viewer's 9:00, and
the day a block belongs to is the day it starts in the viewer's zone. So:

- **Every Date in `src/lib/calendar.ts` is local**, built with `setDate`/`setMinutes`
  rather than millisecond arithmetic, so a week that crosses a DST change still has
  seven days and 10:00 is still 10:00. The database only ever sees instants.
- **The server does not draw the grid.** `fetchWindow()` works in UTC and pads
  generously — two days each side of a week, a week or two around a month — and the
  page draws its own local grid from the superset. Over-fetching a few days is cheaper
  than being one day short at either edge. With no `?date=` the anchor is the server's
  today, and the viewer's week or month may be the one before or after (Sunday evening
  in Los Angeles is Monday in UTC), so that case pads a whole period each side.
- **The grid renders after hydration.** The server cannot know the viewer's clock, so
  `+page.svelte` renders `Calendar.Placeholder` (a skeleton in the grid's proportions)
  until it has mounted, then the real thing. Client-side navigations never see the
  placeholder; a full load sees it for one frame.
- **Forms carry instants; inputs are windows.** `EventForm` keeps `starts_at` /
  `ends_at` as ISO strings and the visible `date` / `datetime-local` inputs are views
  onto them in the browser's zone (`toLocalDateTimeInput()` and friends). Without
  JavaScript the naive value arrives instead and is read as UTC — `instant()` in
  `$lib/server/records`, the same rule the generic record form follows. The form is
  born with the slot or the event it opens on: a popover's content mounts fresh on
  every open, so there is nothing to sync and no effect writing into the store.

## What lives in the URL

`/calendar?view=week&date=2026-09-09`. The load reads both (a view it does not know
falls back to the week, a key that is not a day to today), so a link to next Tuesday is a
link, the back button steps back a week, and moving between weeks is a `goto()` that
reruns one load — [data-invalidation.md](data-invalidation.md), "URL-driven state". The
title (`Calendar.Title`) and the grid slide in the direction of the step.

## The writes

Every mutation is a form action on `+page.server.ts`, gated by `requirePermission()`
and backed by RLS, with the three levels the staff page uses: `read` sees the grid,
`manage` books, edits and moves, `delete` removes.

| action   | posted by                                   | validates with      |
| -------- | ------------------------------------------- | ------------------- |
| `create` | the booking popover (`EventForm`)           | `createEventSchema` |
| `update` | the edit modal (the same `EventForm`)       | `updateEventSchema` |
| `move`   | a drag or a stretch, from the page's script | `moveEventSchema`   |
| `remove` | the delete modal                            | `deleteEventSchema` |

**`move` is a form action called from a gesture.** A drag has no form to post, but its
payload is three strings — the id and the two instants it changed — which is exactly
what a form action takes. So the page keeps a hidden `<form action="?/move">` whose
hidden inputs are bound to a `superForm` store: a drop writes the store, waits a tick
for the inputs to take the values, and calls `requestSubmit()` — the staff page's
hold-to-remove submits the same way — and a drag takes the same road as the booking
form: same gate, same RLS, same `message()` on refusal, `onUpdated` for the answer.
`multipleSubmits: 'allow'` because two drags in flight is the normal case for someone
tidying a week. It posts only the two columns it changed, so a gesture never overwrites
a title someone else is editing. The notes endpoint stays the app's one `+server.ts`
exception; this is not a second one.

**The block stays where it was dropped while the answer comes back.** `+page.svelte`
keeps a `pending` map of id → placement that is folded over `data.events`, clears it
once `invalidate(QUERY.calendar)` has brought the grid back with the event there — and
only if a later drag of the same event has not replaced it — and puts it back on failure
with the error in a toast. Success toasts say where the event went, with an **Undo**
that posts the move in reverse.

An event may only be booked _for_ a record the caller could open — the same
`passesFeatureGate()` the record page uses — and the check runs before the database is
asked, so a refusal never confirms an id exists.

## The parts

`src/lib/components/calendar/` is a compound: structural parts, two interactive views,
and one way to draw an event. The page owns every event, every form and every write;
the views own their pointer gestures and hand the result up as callbacks.

| part                   | what it is                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `Calendar.Root`        | the framed surface; takes the height the page gives it and lets the views fill it        |
| `Calendar.Toolbar`     | the line under the heading: today, the arrows, the title, the view switch                |
| `Calendar.Title`       | the span on screen ("Sep 7 – 13, 2026"), crossfading in the direction of the last step   |
| `Calendar.Month`       | rows of seven laid out in lanes; chips lift and follow the pointer to another day        |
| `Calendar.Week`        | the all-day strip and the hours; move, stretch and draw-to-book — a day is a week of one |
| `Calendar.Event`       | a chip, a bar or a block; the views place it and it only knows how an event looks        |
| `Calendar.Placeholder` | the skeleton the server renders where the grid will be                                   |

The page's height is fixed (`h-[calc(100dvh-…)]`), not a minimum, so the grid fills the
room and scrolls inside it: a week is never a page-long scroll and a month always fits.

### Layout, in `src/lib/calendar.ts`

- **`layoutRow(events, days)`** packs everything touching a row of days into lanes:
  banners first (all-day events, and any timed one that crosses midnight), sorted by
  where they start and longest first, then each day's timed chips in start order; each
  takes the highest lane free across every column it spans. A multi-day bar is one
  unbroken run and a Tuesday chip never sits above a Monday-to-Wednesday bar. The month
  view lays each week out this way; the week view's all-day strip is one such row. A
  cell shows as many lanes as fit under its number, and when a day in the row has more,
  the row gives up its last lane for "+N more" — decided per row, so a bar is drawn on
  all its days or on none.
- **`layoutDay(events, day)`** places timed blocks side by side where they overlap:
  events are swept into clusters, each takes the first free track, and every block in a
  cluster shares the cluster's track count — two overlapping meetings are halves, three
  are thirds, an event alone in the afternoon keeps the full width.
- **Gestures write placements**: `shifted()` moves by days then minutes keeping the
  length, `movedToDay()` drops on another day at the same time of day, `resizedTo()`
  stretches to a new end and never below `MIN_EVENT_MINUTES`, `timedSlot()` /
  `allDaySlot()` are what a click books. Everything snaps to `SNAP_MINUTES`.

### Gestures, in the views

Pointer events with capture, so a drag survives leaving the block. A press becomes a
gesture only after a few pixels of travel, so a click still opens the event or books
the slot. Escape cancels; a lost capture ends the gesture rather than leaving it live.

Two details that are easy to get wrong:

- **Nothing is re-laid out while a gesture is live.** A moved bar or block is
  translated where it sits (`liftedOffset()`), and a stretched block is drawn taller in
  place (`blockHeight()`); the lanes and the tracks are computed from the untouched
  events until the drop. Feeding the live placement back into the layout would re-sort
  the keyed each, Svelte would move the element in the DOM to keep the order, and a
  node that moves loses the pointer capture the drag rides on — the gesture would go
  dead on the first column crossing.
- **The click after a drop is not a click.** Both views swallow the `click` that follows
  a `pointerup` that ended a drag, so a dropped chip does not also open.

The drawing surface under a week column and the click target under a month cell are
real `<button>`s, behind the events, so keyboard users reach every day (Enter books the
morning) and the events — `role="button"` divs, because a block contains its resize
handle — stay siblings rather than nested controls.

### Motion

All of it through `$lib/motion` and Tailwind transitions that honour reduced motion:
the title crossfades and the grid slides in the direction of a step (`motionTransition`),
a new or moved chip pops into its cell, blocks arrive with `motionEnter`, and the lift
is a scale-and-shadow with a short easing so snapping reads as gliding. Nothing calls
Motion's `animate` directly.

## Deliberately not here (yet)

- **Attendees beyond one.** A join table onto the membership, the day a meeting needs
  more than the person it belongs to; `assigned_to` is that person.
- **Recurrence.** An RRULE column and an expansion in the load — never a row per
  occurrence.
- **Reminders.** The notifications table already exists for them.
- **Tasks on the grid.** A task is due, not booked; showing due dates as a second layer
  is a read-only overlay for a later day, not a reason to store tasks as events.
- **A record page's calendar.** `calendar_events_entity_idx` is there for it, and
  `recordLinks()` already names the other direction.
