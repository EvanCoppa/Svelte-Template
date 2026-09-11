-- tasks.status — a to-do gets a board.
--
-- The crm_core migration gave a task a `completed_at` and said why there was
-- no status flag beside it: "done" is a timestamp that doubles as the flag
-- and records when. That was right for a list with a checkbox, and it stops
-- being enough the moment the tasks page becomes a board. A column per state
-- needs states, and open/done is not a board — it is two piles with nothing
-- between them, so the work that is underway and the work that is stuck look
-- identical to everyone who is not doing it.
--
-- So: a status enum, and the timestamp stays. They are not two ways to say
-- the same thing — `status` is WHERE the task sits, `completed_at` is WHEN it
-- was finished — and a trigger holds the one relationship between them
-- (`status = 'done'` exactly when `completed_at` is set) so neither can drift.
-- Every caller that predates this migration keeps working unchanged:
-- `completeTask()` writes the timestamp and the row lands in Done.
--
-- Why an enum rather than rows: the deals migration replaced `deal_stage` with
-- `pipelines` + `pipeline_stages` because a dental practice and a roofer do
-- not run the same sales board. A to-do list is not that — "not started,
-- underway, stuck, finished" is the same four states in every vertical, and
-- what a task IS called is already industry-settable through the feature's
-- terms. Org-definable sets are rows; vocabularies we own are enums, and this
-- is one we own.
--
-- Deliberately NOT here: a 'cancelled' state. It would be a second closed
-- state, and `completed_at` can only be honest about one of them — a task
-- nobody is going to do is deleted, which owners and admins already can.
--
-- Urgency is NOT here either: the task_system migration that precedes this one
-- renamed `ticket_priority` to `priority` and gave tasks a column of it, which
-- is the same call this file makes about status — one vocabulary we own,
-- shared rather than declared twice.

-- ---------------------------------------------------------------------------
-- The vocabulary
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');

comment on type public.task_status is
	'Where a task sits on the board. `done` is pinned to tasks.completed_at by trigger.';

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.tasks
	add column status public.task_status not null default 'todo';

comment on column public.tasks.status is
	'Where the task sits on the board. Kept in step with completed_at by tasks_sync_completion.';

-- Everything already finished lands in Done, so the board is right on the
-- first load rather than after somebody drags a hundred cards.
update public.tasks set status = 'done' where completed_at is not null;

-- The board reads one org's tasks a column at a time.
create index tasks_org_id_status_idx on public.tasks (org_id, status);

-- ---------------------------------------------------------------------------
-- The one invariant
-- ---------------------------------------------------------------------------

-- `status = 'done'` exactly when `completed_at` is set — checked as a trigger
-- rather than a constraint, because a constraint can only refuse a write and
-- what every caller here wants is the other column filled in for them.
--
-- When the two disagree, whichever moved in this statement wins: the board
-- writes `status`, the checkbox writes `completed_at`, and neither has to
-- know the other column exists.
create function private.tasks_sync_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if new.status = 'done' and new.completed_at is null then
		if tg_op = 'UPDATE' and old.completed_at is not null and new.status = old.status then
			-- The timestamp was cleared and the status was not touched:
			-- completeTask(…, false) reopening a finished task.
			new.status := 'todo';
		else
			-- Dropped in the Done column; the board never sends a timestamp.
			new.completed_at := now();
		end if;
	elsif new.status <> 'done' and new.completed_at is not null then
		if tg_op = 'UPDATE' and new.status is distinct from old.status then
			-- Dragged back out of Done: it is not finished after all, and the
			-- row should not claim a finishing time.
			new.completed_at := null;
		else
			-- The timestamp was set on its own: completeTask(), or a seeded row.
			new.status := 'done';
		end if;
	end if;
	return new;
end;
$$;

comment on function private.tasks_sync_completion() is
	'Holds tasks.status = ''done'' <=> tasks.completed_at is not null, letting either column be the one a caller writes.';

create trigger tasks_sync_completion
	before insert or update on public.tasks
	for each row execute procedure private.tasks_sync_completion();

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- The task_system migration's grant list, plus the one new column. Moving a
-- card is a member act, like every other edit to a task; `status` is
-- insertable so a task can be created straight into the column it belongs in,
-- while `completed_at` stays update-only as it was — the trigger fills it in
-- when that status is `done`.

revoke insert, update on table public.tasks from authenticated;
grant insert (org_id, company_id, contact_id, title, details, due_at, priority, status,
		created_by),
	update (company_id, contact_id, title, details, due_at, completed_at, priority, status)
	on table public.tasks to authenticated;
