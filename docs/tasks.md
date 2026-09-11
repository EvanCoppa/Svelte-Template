# Tasks

A task is the smallest unit of "somebody needs to do this": a title, when it is due,
how urgent it is, who is on it, and the conversation about it. It is the first
feature whose assignment lives on the relationship graph rather than in a column,
so it doubles as the worked example for anything that follows.

## The four parts

| What             | Where it lives                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| the task itself  | `public.tasks` — title, details, `due_at`, `completed_at`, `priority`        |
| who is on it     | `assigned_to` relationships (`public.relationships`), not a column           |
| the conversation | `public.task_comments`, one row per message                                  |
| everything else  | the shared attach tables — activities, tags, custom fields, notes, addresses |

Data access is `src/lib/server/crm/tasks.ts` and `src/lib/server/crm/task-comments.ts`.
Nothing outside those two modules and the record page knows how any of it is stored.

## Done is a timestamp, urgency is a column

`completed_at` being set IS done — there is no status enum, and the column is
update-only (a task is never born completed, so the insert grant excludes it).
`taskState()` in `src/lib/crm/tones.ts` turns it into the pill the list and the
record page draw.

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

## Where the screens are

There is no `(app)/tasks/[id]/` route. A task uses the generic record page, because
after the thread there was nothing left that was task-shaped: the details card, the
relationships card, activities, notes and custom fields are the same parts every
record gets. If a task ever earns its own screen, it goes at `(app)/tasks/[id]/` —
a static segment outranks the `[kind=record]` matcher — and composes the same
`RecordDetail` and `detail/` parts rather than a second renderer.

The list is `(app)/tasks/`, creation is the generic `CreateRecord` form
(`RECORD_FORMS.task`), and freshness is `QUERY.tasks` for the list and
`QUERY.record('task', id)` for one task, including after a message is posted.

## Adding this to another kind

Assignment: the three helpers above, then drop that kind's `assigned_to` column and
its grants. Nothing else changes — `getRelationships()` already orients and names
the rows, so the record page picks it up with no edit.

A conversation: copy `task_comments` (itself a copy of `ticket_comments`), add a
branch to `hasThread()` and to the `saveComment` / `removeComment` actions, and
return a `thread` from the load. The component is already shared.
