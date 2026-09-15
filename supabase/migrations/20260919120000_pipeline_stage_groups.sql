-- The deal board's answer to the task board's `TASK_STATUS_GROUPS` — a column
-- is not the same question as a stage, and a wide funnel should not cost the
-- reader a column per stage to scan it.
--
-- The task board can hardcode its groups (`TASK_STATUS_GROUPS` in
-- `src/lib/crm/tones.ts`) because `task_status` is a fixed enum WE own — four
-- values, one JS constant, done. A pipeline's stages are the opposite of that
-- on purpose (the pipelines migration's whole point: "org-definable sets are
-- rows"), so the grouping has to be rows too, or two orgs with different
-- funnels could never group differently. `pipeline_stage_groups` is that row:
-- one per visual column an org's stages share, the same way `pipelines` is one
-- row per board.
--
--   pipeline_stage_groups   a named column on one pipeline's board
--   pipeline_stages.group_id  which column an OPEN stage draws under, if any
--
-- Nothing here touches the Closed column: every stage whose outcome closes the
-- deal already shares one column by outcome alone (`buildDealColumns()`), and
-- that rule is unrelated to how many OPEN stages a funnel has. A stage with no
-- group is its own column, exactly as it always has been — this is additive,
-- not a replacement for the one-column-per-stage default.
--
-- Like a group is never written to a task, a deal is never written to a
-- group either: `buildDealColumns()` still writes `pipeline_stages.id` as the
-- status a card sits in. Dropping a card on a column with several stages asks
-- which stage, through the same `Kanban.Zones` drop zones the Closed column
-- already draws.

create table public.pipeline_stage_groups (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	pipeline_id uuid not null,
	label text not null,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (pipeline_id, org_id) references public.pipelines (id, org_id) on delete cascade,
	unique (pipeline_id, label),
	-- Composite target for pipeline_stages.group_id below — the same shape as
	-- every other "this row belongs to that board" reference here.
	unique (id, pipeline_id),
	constraint pipeline_stage_groups_label_not_blank check (length(trim(label)) > 0)
);

comment on table public.pipeline_stage_groups is
	'One visual column of a pipeline board that several OPEN stages share — the deal board''s TASK_STATUS_GROUPS, as rows because a pipeline''s stages are rows too. Never itself a deal''s status; pipeline_stages.stage_id stays what a deal is placed in.';

create index pipeline_stage_groups_org_id_idx on public.pipeline_stage_groups (org_id);
create index pipeline_stage_groups_pipeline_id_idx on public.pipeline_stage_groups (pipeline_id);

create trigger pipeline_stage_groups_set_updated_at
	before update on public.pipeline_stage_groups
	for each row execute procedure public.set_updated_at();

alter table public.pipeline_stages
	add column group_id uuid,
	-- A stage's group, if any, must be a column on the stage's OWN board — the
	-- same guarantee (stage_id, pipeline_id) already gives a deal.
	add constraint pipeline_stages_group_id_pipeline_id_fkey
		foreign key (group_id, pipeline_id)
		references public.pipeline_stage_groups (id, pipeline_id)
		on delete set null;

comment on column public.pipeline_stages.group_id is
	'The column this OPEN stage shares with others, if any. Null draws it as a column of its own — the default every stage has always had. Unrelated to the Closed column, which groups by outcome regardless of this.';

-- ---------------------------------------------------------------------------
-- Row level security — the same shape pipeline_stages already has
-- ---------------------------------------------------------------------------

alter table public.pipeline_stage_groups enable row level security;

create policy "Members can view pipeline stage groups"
	on public.pipeline_stage_groups for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create pipeline stage groups"
	on public.pipeline_stage_groups for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update pipeline stage groups"
	on public.pipeline_stage_groups for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete pipeline stage groups"
	on public.pipeline_stage_groups for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- pipeline_id is insert-only, same reason as pipeline_stages': moving a
-- group to another board would strand every stage pointed at it.
revoke insert, update on table public.pipeline_stage_groups from authenticated;
grant insert (org_id, pipeline_id, label, sort_order),
	update (label, sort_order)
	on table public.pipeline_stage_groups to authenticated;

-- pipeline_stages grows one grantable column.
revoke insert, update on table public.pipeline_stages from authenticated;
grant insert (org_id, pipeline_id, name, sort_order, outcome, probability, group_id),
	update (name, sort_order, outcome, probability, group_id)
	on table public.pipeline_stages to authenticated;

-- ---------------------------------------------------------------------------
-- create_default_pipeline builds an industry's groups too, from
-- industry_pipeline_stages.group_label
-- ---------------------------------------------------------------------------

create or replace function public.create_default_pipeline(org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	pipeline uuid;
	industry text;
	board public.industry_pipelines;
	has_stages boolean;
begin
	select o.industry_id into industry from public.organizations o where o.id = org;

	select ip.* into board from public.industry_pipelines ip where ip.industry_id = industry;

	insert into public.pipelines (org_id, name, description, is_default)
	values (
		org,
		coalesce(board.name, 'Sales'),
		coalesce(board.description, 'The default pipeline every organization starts with.'),
		true
	)
	returning id into pipeline;

	select exists (
		select 1 from public.industry_pipeline_stages s where s.industry_id = industry
	) into has_stages;

	if has_stages then
		-- One column per distinct group label the industry's stages name, in
		-- the order the first stage under it appears — set-based, so no
		-- procedural label-to-id map is needed: the stage insert below joins
		-- back to this by (pipeline, label).
		insert into public.pipeline_stage_groups (org_id, pipeline_id, label, sort_order)
		select org, pipeline, g.group_label, g.sort_order
		from (
			select distinct on (s.group_label) s.group_label, s.sort_order
			from public.industry_pipeline_stages s
			where s.industry_id = industry and s.group_label is not null
			order by s.group_label, s.sort_order
		) as g;

		insert into public.pipeline_stages
			(org_id, pipeline_id, name, sort_order, outcome, probability, group_id)
		select org, pipeline, s.name, s.sort_order, s.outcome, s.probability, gr.id
		from public.industry_pipeline_stages s
		left join public.pipeline_stage_groups gr
			on gr.pipeline_id = pipeline and gr.label = s.group_label
		where s.industry_id = industry
		order by s.sort_order;
	else
		-- The stages the `deal_stage` enum carried, unchanged from the
		-- original migration: an org whose industry ships nothing still gets
		-- exactly the board it always has, with no groups.
		insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
		values
			(org, pipeline, 'Lead', 10, 'open', 10),
			(org, pipeline, 'Qualified', 20, 'open', 30),
			(org, pipeline, 'Proposal', 30, 'open', 60),
			(org, pipeline, 'Negotiation', 40, 'open', 80),
			(org, pipeline, 'Won', 50, 'won', 100),
			(org, pipeline, 'Lost', 60, 'lost', 0);
	end if;

	return pipeline;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grouping another board's stages, after this
-- ---------------------------------------------------------------------------
-- Insert `pipeline_stage_groups` rows for the board and point the stages'
-- `group_id` at them (owner/admin, from Settings once that screen exists, or
-- by hand today — there is no per-org pipeline editor yet, matching
-- pipelines/pipeline_stages themselves). For an industry's own default board,
-- give its `industry_pipeline_stages` rows a `group_label` instead; every new
-- org in that industry gets the matching groups from `create_default_pipeline()`.
