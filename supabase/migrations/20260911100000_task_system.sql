-- Tasks become a system of their own: many assignees, a priority, and a
-- conversation.
--
-- Three changes, and one thing deliberately removed:
--
--   assignment   `tasks.assigned_to` was one member, because a column can
--                only ever be one. Real work is assigned to a pair, or to a
--                crew, and it moves from one person to another with the
--                handover worth keeping. That is the relationship graph's
--                job (the relationships migration), so the column goes and
--                `assigned_to` — the system type already shipped for assets
--                — carries it: one row per assignee, `ended_on` recording a
--                handover instead of overwriting it.
--   priority     a column, because every task has one and lists sort and
--                filter by it. It reuses the vocabulary support tickets
--                already own rather than declaring a second enum with the
--                same four values.
--   conversation `task_comments`, the ticket thread's shape exactly:
--                authored content, editable by its author or an owner/admin.
--
-- Isolated on purpose: nothing outside `tasks`, `task_comments` and the two
-- rows touched in `relationship_types` changes shape. Deals and calendar
-- events keep their own `assigned_to` columns — each is genuinely one
-- person, and neither is this migration's business.

-- ---------------------------------------------------------------------------
-- priority — one vocabulary, now shared
-- ---------------------------------------------------------------------------
-- `ticket_priority` was named for its only table. A second enum with the
-- same four values would be the same vocabulary written twice, so the type
-- is renamed to what it actually is and both tables use it. Renaming a type
-- rewrites no data and leaves `support_tickets.priority` untouched.

alter type public.ticket_priority rename to priority;

comment on type public.priority is
	'How urgent a piece of work is. Shared by support_tickets and tasks; the ladder is low < normal < high < urgent.';

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

alter table public.tasks
	add column priority public.priority not null default 'normal';

comment on column public.tasks.priority is
	'How urgent the task is. A column, not a custom field: every task has one and the list sorts by it.';

-- Composite target for task_comments, the same trick support_tickets uses:
-- it lets a comment carry org_id AND be foreign-keyed to a task in that same
-- org, so no policy has to traverse the task to know the comment's tenant.
alter table public.tasks
	add constraint tasks_id_org_id_key unique (id, org_id);

create index tasks_priority_idx on public.tasks (priority);

-- ---------------------------------------------------------------------------
-- Assignment moves to the graph
-- ---------------------------------------------------------------------------
-- The shipped `assigned_to` type was scoped `source_type = 'asset'` because
-- assets were the only thing being assigned. A task is assigned exactly the
-- same way, so the source opens up rather than a near-duplicate type being
-- added; `target_type` was already null and stays so (an asset can be
-- assigned to a member or, one day, a contact).
--
-- Widening is always safe — `check_relationship_type_scope` only refuses a
-- NARROWING that would strand existing rows.
--
-- The inverse label moves with it. "holds" was written for an asset and
-- reads as nonsense on a task ("Dana holds Re-roof the east wing"), while
-- "assignee of" reads correctly from the member's side for both.

update public.relationship_types
set source_type = null,
	inverse_label = 'assignee of'
where id = 'f0000000-0000-0000-0000-000000000012';

-- Every currently-assigned task becomes one open relationship. `created_by`
-- is the task's author rather than null: the assignment was their act, and
-- the column is nullable only for users who have since been deleted.
--
-- `on conflict do nothing` against the one-open-per-pair index keeps this
-- re-runnable, which is what `db:reset` needs.
insert into public.relationships
	(org_id, relationship_type_id, from_type, from_id, to_type, to_id, created_by)
select t.org_id,
	'f0000000-0000-0000-0000-000000000012',
	'task',
	t.id,
	'member',
	t.assigned_to,
	t.created_by
from public.tasks t
where t.assigned_to is not null
on conflict do nothing;

-- The column has done its job. Dropping it takes its index and its
-- membership foreign key with it.
alter table public.tasks drop column assigned_to;

-- ---------------------------------------------------------------------------
-- task_comments — the conversation on a task
-- ---------------------------------------------------------------------------
-- Deliberately a table of its own rather than activities or notes: an
-- activity is a moment that happened and a note is a document that stays
-- open, while this is a thread people reply in. `ticket_comments` is the
-- same thing on a ticket and this is its shape, minus `is_internal` — a
-- task has no client-facing surface to hide anything from, and a flag
-- nothing reads is a promise the schema cannot keep.

create table public.task_comments (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	task_id uuid not null,
	author_id uuid references auth.users (id) on delete set null default auth.uid(),
	body text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint task_comments_body_not_blank check (length(trim(body)) > 0),
	foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade
);

comment on table public.task_comments is
	'One message in a task''s thread. Authored content: its author or an owner/admin may edit it.';

create index task_comments_org_id_idx on public.task_comments (org_id);
-- The thread, in order, is the only way this is ever read.
create index task_comments_task_id_created_at_idx
	on public.task_comments (task_id, created_at);

create trigger task_comments_set_updated_at
	before update on public.task_comments
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.task_comments enable row level security;

create policy "Members can view task comments"
	on public.task_comments for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can comment as themselves"
	on public.task_comments for insert to authenticated
	with check (private.org_role(org_id) is not null and author_id = (select auth.uid()));

create policy "Authors and managers can update task comments"
	on public.task_comments for update to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	)
	with check (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

create policy "Authors and managers can delete task comments"
	on public.task_comments for delete to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

-- `assigned_to` is gone and `priority` takes its place in both lists.
revoke insert, update on table public.tasks from authenticated;
grant insert (org_id, company_id, contact_id, title, details, due_at, priority, created_by),
	update (company_id, contact_id, title, details, due_at, completed_at, priority)
	on table public.tasks to authenticated;

-- Which task a comment belongs to is fixed when it is written; only the
-- body is ever corrected. `author_id` is insert-only so a comment cannot be
-- re-attributed after the fact.
revoke insert, update on table public.task_comments from authenticated;
grant insert (org_id, task_id, author_id, body),
	update (body)
	on table public.task_comments to authenticated;

-- ---------------------------------------------------------------------------
-- Adding another kind of assignable record
-- ---------------------------------------------------------------------------
-- Nothing here is task-shaped. To let a deal, a ticket or a kind shipped
-- later carry several assignees:
--   1. it is already an entity kind, so no enum value is needed;
--   2. write the relationship rows (the `assigned_to` type accepts any
--      source since this migration);
--   3. drop its own `assigned_to` column and its grants, as above;
--   4. read them with `getRelationships()` — src/lib/server/crm/relationships.ts
--      orients the row and names the member; no query changes.
-- A conversation is the same story: copy `task_comments`, which is itself a
-- copy of `ticket_comments`.
