-- tasks.status — the work is done, and it is not Done.
--
-- The task board migration gave a to-do four states and said why: "not
-- started, underway, stuck, finished" is the same shape of day in every
-- vertical. It is, and it is missing the one step that happens between the
-- last two whenever more than one person is involved. A task somebody has
-- finished but nobody has checked is not `in_progress` — nobody is working on
-- it — and it is certainly not `done`, because `done` is pinned to
-- `completed_at` and would claim a finishing time for work that may come
-- straight back. Without a state of its own it gets parked in `blocked`,
-- which says the opposite of what is true: the task is not stuck on anything,
-- it is waiting on a reader.
--
-- So: `in_review`, immediately before `done` in the enum, because the enum's
-- order is the workflow's order and the board's arrow keys walk it.
--
-- This is a status, not a column. Regrouping the board is an edit to one array
-- in `src/lib/crm/tones.ts`; adding a state a task can actually be stored in
-- is this file (CLAUDE.md, "A task has a column AND a finishing time").
--
-- Everything else the board rests on is already in place and needs no change:
-- `tasks_org_id_status_idx` covers the new value, the column-level grant on
-- `status` is a grant on the column rather than its values, and
-- `private.tasks_sync_completion()` only ever asks whether a status is `done`
-- — so a task moved into review has its `completed_at` cleared by the same
-- branch that handles a card dragged back out of Done, and no row can sit in
-- review while claiming it was finished.

alter type public.task_status add value if not exists 'in_review' before 'done';

comment on type public.task_status is
	'Where a task sits on the board, in workflow order. `done` is pinned to tasks.completed_at by trigger.';
