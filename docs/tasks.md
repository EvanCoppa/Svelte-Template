# Tasks

A task is the smallest unit of "somebody needs to do this": a title, when it is due,
how urgent it is, who is on it, and the conversation about it. It is the first
feature whose assignment lives on the relationship graph rather than in a column,
so it doubles as the worked example for anything that follows.

## The four parts

| What             | Where it lives                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| the task itself  | `public.tasks` — title, details, `status`, `due_at`, `completed_at`, `priority` |
| who is on it     | `assigned_to` relationships (`public.relationships`), not a column              |
| the conversation | `public.task_comments`, one row per message                                     |
| everything else  | the shared attach tables — activities, tags, custom fields, notes, addresses    |

Data access is `src/lib/server/crm/tasks.ts` and `src/lib/server/crm/task-comments.ts`.
Nothing outside those two modules and the record page knows how any of it is stored.

## Where it sits, when it finished, how urgent it is

`status` (`public.task_status`: `todo` / `in_progress` / `blocked` / `done`) says
WHERE a task sits; `completed_at` says WHEN it was finished. They are not two ways
to say the same thing, and `private.tasks_sync_completion()` (the task board
migration) keeps the one relationship between them — `status = 'done'` exactly when
the timestamp is set. So the board writes `status`, a checkbox writes
`completed_at`, and neither knows the other column exists. `completed_at` stays
update-only: a task is never born completed, so the insert grant excludes it.

`TASK_STATUS_LABEL` and `TASK_STATUS_TONE` in `src/lib/crm/tones.ts` are the one
place a status is named and coloured, so a column, a pill and a card never disagree.

`priority` is a column because every task has one and the list sorts by it. It
reuses `public.priority` — the enum support tickets already owned, renamed from
`ticket_priority` when tasks became its second table. Two enums with the same four
values would have been the same vocabulary written twice. The options are named
once for both forms (`PRIORITY_OPTIONS` in `src/lib/schemas/records.ts`) and toned
once for both tables (`PRIORITY_TONE`).

## Assignment is a relationship

A task is assigned to as many people as the work needs, and who held it last week
is worth keeping — neither of which a `uuid` column can do. So each assignee is one
`assigned_to` row from the task (`from`) to a member (`to`), and:

- **unassigning ends the row, it does not delete it.** `endTaskAssignment()` sets
  `ended_on`; the partial unique index only forbids a second _open_ assignment to
  the same person, so the same person can be assigned again later and the history
  survives. An assignment added by mistake is not history and can be deleted with
  `removeRelationship()`; there is no task-specific wrapper until a screen needs one.
- **`listTaskAssignees()` is the only reader.** It orients the row through
  `orientRelationship()` and names the member through `getDisplayNames()` — the
  same two primitives every other relationship surface uses — rather than reading
  `to_id` directly. `openOnly` asks for who holds it now instead of who ever did.
- **the record page needs no assignee field.** Assignees are relationships, so the
  Relationships card already draws them, labelled "assigned to" from the task's
  side and "assignee of" from the person's. `describeTask()` deliberately has no
  "Assigned to" row — a second copy on the same screen is how the two drift.
- **leaving the org clears it.** `on_member_removed` runs the shared cleanup, so
  nothing is assigned to someone who no longer works there.

The type id is `RELATIONSHIP_TYPE.assignedTo` in `src/lib/server/crm/relationships.ts`.
Types are addressed by id and never by key, because an org may define its own type
reusing a system key.

## The conversation

`task_comments` is `ticket_comments`'s shape — authored content, editable by its
author or an owner/admin, `org_id` carried on the row so no policy traverses the
task. It drops `is_internal`: a task has no client-facing surface to hide anything
from, and a flag nothing reads is a promise the schema cannot keep.

**Posting needs no grant beyond being able to open the record.** A conversation is
participation, not editing — a Viewer who cannot reply is a Viewer nobody talks to
— so the actions check nothing and RLS does the rest: insert as yourself, edit and
delete your own or, as an owner/admin, anyone's.

It is drawn by `Detail.Thread`, and the record page renders it whenever the load
supplies `data.thread`. That is a data-presence check, not a kind check, so a
ticket joins by adding a branch to `hasThread()` and the two comment actions —
never by a second thread component or a forked page.

## The board has two axes: groups, and the statuses under them

The wall is `TASK_STATUS_GROUPS`, not `TASK_STATUSES`. A **group** is a column — the
coarse state somebody scanning the board is looking for — and the **statuses** under
it are what a task is actually in:

| Column      | Statuses under it        |
| ----------- | ------------------------ |
| To do       | `todo`                   |
| In progress | `in_progress`, `blocked` |
| Done        | `done`                   |

Nobody scanning a wall wants a separate column to find the one piece of work that is
moving: "in progress" and "blocked" are one place on the wall and two different
things to know about a card. So they share a column, the card says which it is
(a ring and a word on its eyebrow — the column has only said the group, so "Blocked"
under "In progress" is news rather than the same word twice), and dragging onto that
column splits it into a drop zone per status and asks.

**A group is never a state.** `TASK_STATUS_GROUPS[1].id` is `doing`, and nothing is
ever stored as `doing`: `onmove` is called with a status, the `move` action's schema
is `z.enum(TASK_STATUSES)`, and a group id would be rejected there. Regrouping the
columns is an edit to one array in `src/lib/crm/tones.ts`; adding a _status_ is a
migration and a change to the four states the enum deliberately holds (CLAUDE.md,
"A task has a column AND a finishing time" — there is no `cancelled`).

A test in `src/lib/crm/tasks.test.ts` pins the invariant that ties the two axes
together: every status appears in exactly one group, in workflow order. A status
left out of every group is a card that never appears on the board.

## What a card does in place

A card is not just a label. It carries, and lets you change, the four things you act
on without opening the record:

| On the card       | Action                | What it writes                                              |
| ----------------- | --------------------- | ----------------------------------------------------------- |
| drag / ← →        | `move`                | `status`                                                    |
| the date chip     | `schedule`            | `due_at`, or null — "no due date" is an answer, not a blank |
| the priority chip | `prioritize`          | `priority`                                                  |
| the people menu   | `assign` / `unassign` | an `assigned_to` row, or its `ended_on`                     |

Every one of them is a **gesture**, and a gesture has no form of its own to post, so
each fills a hidden `<form>` bound to a `superForm` store and calls `requestSubmit()`
— the road the calendar's drag-to-move takes (CLAUDE.md, "Server actions vs API
endpoints"). Never a `fetch`: the point is that a drag hits the same `manage` gate,
the same RLS and the same `message()` on refusal as a typed-in form would.

The load reads what a card shows in **one query each for the whole board**, not one
per card: `listAssigneesByTask()` for who is on them, `countTaskComments()` for how
much conversation each has collected, and `listStaff()` for the menu of people —
that last one only when the reader can manage a task, since otherwise there is no
menu to open. Without `manage` the whole board is frozen and every chip is plain
text, rather than offering a drag that would come back a 403.

## Where the screens are

There is no `(app)/tasks/[id]/` route. A task uses the generic record page, because
after the thread there was nothing left that was task-shaped: the details card, the
relationships card, activities, notes and custom fields are the same parts every
record gets. If a task ever earns its own screen, it goes at `(app)/tasks/[id]/` —
a static segment outranks the `[kind=record]` matcher — and composes the same
`RecordDetail` and `detail/` parts rather than a second renderer.

The list is `(app)/tasks/`, creation is the task modal below, and freshness is
`QUERY.tasks` for the list and `QUERY.record('task', id)` for one task, including
after a message is posted.

## The task modal

A task is the one kind of record that is **not** created through the generic
`CreateRecord` form. `(app)/tasks/create-task.svelte` is its own modal, and it earns
that the way the calendar's booking form does — by writing more than a row of
strings:

- **who is on it is a relationship**, so the post writes the task AND one
  `assigned_to` row per person named, in the one action (`?/create`,
  `createTaskSchema` in `schema.ts`). Several people at once, because that is what
  the graph allows and a column never did. A new task starts assigned to the writer.
- **what it is about is a party** — a company or a person — chosen from one picker
  over both kinds rather than two fields, posted as the shared `<kind>:<id>` ref
  (`$lib/schemas/record-ref`, the calendar's spelling) and accepted only when the
  caller may open that kind (the same `passesFeatureGate()` the hook applies).
- **when is a calendar with the days that get picked most as one-click choices** —
  today, tomorrow, next week, no date — stored as the end of that day in the
  writer's zone so "today" is not late the moment it is written. The chip reads
  the day in the same words a card does (`dueLabel()`).

The three are chips under the title rather than fields beside it, because they are
set far more often than they are typed. **Create more** keeps the modal open after
a save and clears the title only: five tasks in a row are usually five things for
the same person about the same account. Details and priority are not in the modal
on purpose — they are edited on the record page through the generic form
(`RECORD_FORMS.task`, which is why `task` stays an `EditableRecordType`), where
every other kind's fields live.

The page's load reads the modal's pickers for writers only (the roster it already
had for the cards, plus the companies and contacts the reader may open), and
`page.server.test.ts` pins what the action writes and refuses.

## Adding this to another kind

Assignment: the three helpers above, then drop that kind's `assigned_to` column and
its grants. Nothing else changes — `getRelationships()` already orients and names
the rows, so the record page picks it up with no edit.

A conversation: copy `task_comments` (itself a copy of `ticket_comments`), add a
branch to `hasThread()` and to the `saveComment` / `removeComment` actions, and
return a `thread` from the load. The component is already shared.
