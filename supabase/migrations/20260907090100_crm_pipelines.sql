-- Pipelines: the stages a deal moves through, as data instead of an enum.
--
-- crm_core shipped `deal_stage` as an enum — lead → qualified → proposal →
-- negotiation → won/lost — which is the right default and the wrong ceiling. A
-- dental practice runs consult → treatment plan presented → scheduled; a
-- roofer runs inspection → estimate → contract → build. Neither is a variation
-- on the other, and neither is worth a migration to express. The rule the
-- proposals migration wrote down applies exactly: fixed vocabularies WE own are
-- enums, org-definable sets are a lookup table with a foreign key.
--
-- So stages become rows, and the enum's own values become the stages of the
-- default pipeline every org gets — meaning nothing changes for an org that
-- never opens the settings screen, which is the point.
--
--   pipelines        a named board. One per org is flagged `is_default`.
--   pipeline_stages  its columns, ordered, each with a forecast weight and an
--                    `outcome` saying whether landing there closes the deal.
--
-- Two guarantees are worth the composite keys they cost: a deal's stage always
-- belongs to the deal's own pipeline (the (stage_id, pipeline_id) foreign key,
-- not two independent ones), and a pipeline always belongs to the deal's org.

-- Whether a stage ends the deal, and which way. `open` is every working stage;
-- the two closed values are what a report counts and what a board greys out.
-- This IS ours to own — every pipeline in every vertical has exactly these
-- three outcomes — so it stays an enum while the stages themselves do not.
create type public.stage_outcome as enum ('open', 'won', 'lost');

-- ---------------------------------------------------------------------------
-- pipelines
-- ---------------------------------------------------------------------------

create table public.pipelines (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	description text,
	is_default boolean not null default false,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, name),
	-- Composite target: a stage, and a deal's pipeline, must be this org's.
	unique (id, org_id),
	constraint pipelines_name_not_blank check (length(trim(name)) > 0)
);

comment on table public.pipelines is
	'A named deal board owned by one org. Org configuration, not reference data: each org defines its own.';

create index pipelines_org_id_idx on public.pipelines (org_id);

-- Exactly one default per org, said with a partial unique index rather than a
-- trigger. New deals land in it when the caller names no pipeline.
create unique index pipelines_one_default_per_org_idx
	on public.pipelines (org_id)
	where is_default;

create trigger pipelines_set_updated_at
	before update on public.pipelines
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pipeline_stages
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	pipeline_id uuid not null,
	name text not null,
	sort_order integer not null default 0,
	outcome public.stage_outcome not null default 'open',
	-- Forecast weighting as a percentage (30 = 30%). Nullable: an org that does
	-- not forecast leaves it empty rather than inventing numbers.
	probability numeric(5, 2),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (pipeline_id, org_id) references public.pipelines (id, org_id) on delete cascade,
	unique (pipeline_id, name),
	-- Composite target for deals: referencing (id, pipeline_id) is what makes
	-- "this deal's stage belongs to this deal's pipeline" a constraint rather
	-- than a convention.
	unique (id, pipeline_id),
	constraint pipeline_stages_name_not_blank check (length(trim(name)) > 0),
	constraint pipeline_stages_probability_is_percent
		check (probability is null or probability between 0 and 100)
);

comment on table public.pipeline_stages is
	'One column of a pipeline. `outcome` says whether reaching it closes the deal won or lost; `probability` weights the forecast.';

create index pipeline_stages_org_id_idx on public.pipeline_stages (org_id);
create index pipeline_stages_pipeline_id_sort_order_idx
	on public.pipeline_stages (pipeline_id, sort_order);

create trigger pipeline_stages_set_updated_at
	before update on public.pipeline_stages
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Every org gets the starter pipeline
-- ---------------------------------------------------------------------------

-- The stages are the `deal_stage` enum this migration removes, so an org that
-- never touches the settings screen sees exactly the board it had before.
-- SECURITY DEFINER for the same reason handle_new_organization is: the trigger
-- runs as whoever inserted the org, who has no policy on these tables yet.
create function public.create_default_pipeline(org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	pipeline uuid;
begin
	insert into public.pipelines (org_id, name, description, is_default)
	values (org, 'Sales', 'The default pipeline every organization starts with.', true)
	returning id into pipeline;

	insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
	values
		(org, pipeline, 'Lead', 10, 'open', 10),
		(org, pipeline, 'Qualified', 20, 'open', 30),
		(org, pipeline, 'Proposal', 30, 'open', 60),
		(org, pipeline, 'Negotiation', 40, 'open', 80),
		(org, pipeline, 'Won', 50, 'won', 100),
		(org, pipeline, 'Lost', 60, 'lost', 0);

	return pipeline;
end;
$$;

create function public.handle_new_organization_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.create_default_pipeline(new.id);
	return new;
end;
$$;

create trigger on_organization_created_pipeline
	after insert on public.organizations
	for each row execute procedure public.handle_new_organization_pipeline();

-- Backfill: orgs that existed before this migration. Idempotent — only orgs
-- with no pipeline qualify, so a re-run is a no-op.
do $$
declare
	org record;
begin
	for org in
		select o.id from public.organizations o
		where not exists (select 1 from public.pipelines p where p.org_id = o.id)
	loop
		perform public.create_default_pipeline(org.id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- deals move from the enum to the rows
-- ---------------------------------------------------------------------------

alter table public.deals
	add column pipeline_id uuid,
	add column stage_id uuid;

-- Carry every existing deal across by matching the enum's label to the stage
-- name in its org's default pipeline — the names were chosen above to make
-- this exact and total.
update public.deals d
set pipeline_id = s.pipeline_id, stage_id = s.id
from public.pipeline_stages s
join public.pipelines p on p.id = s.pipeline_id and p.is_default
where p.org_id = d.org_id and lower(s.name) = d.stage::text;

alter table public.deals
	alter column pipeline_id set not null,
	alter column stage_id set not null,
	add constraint deals_pipeline_id_org_id_fkey
		foreign key (pipeline_id, org_id) references public.pipelines (id, org_id),
	-- The composite that pins the stage to the deal's own pipeline. `restrict`
	-- rather than cascade or set null: a stage with deals in it is not
	-- deletable, because either alternative silently loses where the deal was.
	add constraint deals_stage_id_pipeline_id_fkey
		foreign key (stage_id, pipeline_id) references public.pipeline_stages (id, pipeline_id)
		on delete restrict;

create index deals_stage_id_idx on public.deals (stage_id);
create index deals_org_id_pipeline_id_idx on public.deals (org_id, pipeline_id);

alter table public.deals drop column stage;
drop type public.deal_stage;

-- A deal that names no pipeline lands in the org's default, at its first
-- stage. Without this every insert would have to look the board up first, and
-- `createDeal(title)` would stop being a one-liner.
create function public.set_deal_default_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.pipeline_id is null then
		select p.id into new.pipeline_id
		from public.pipelines p
		where p.org_id = new.org_id and p.is_default;
	end if;

	if new.stage_id is null then
		select s.id into new.stage_id
		from public.pipeline_stages s
		where s.pipeline_id = new.pipeline_id
		order by s.sort_order, s.name
		limit 1;
	end if;

	return new;
end;
$$;

create trigger deals_set_default_stage
	before insert on public.deals
	for each row execute procedure public.set_deal_default_stage();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Pipelines are org configuration, like custom_field_definitions: everyone
-- reads them (the board renders from them), owners and admins shape them.

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;

create policy "Members can view pipelines"
	on public.pipelines for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create pipelines"
	on public.pipelines for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update pipelines"
	on public.pipelines for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete pipelines"
	on public.pipelines for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view pipeline stages"
	on public.pipeline_stages for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create pipeline stages"
	on public.pipeline_stages for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update pipeline stages"
	on public.pipeline_stages for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete pipeline stages"
	on public.pipeline_stages for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.pipelines from authenticated;
grant insert (org_id, name, description, is_default, sort_order),
	update (name, description, is_default, sort_order)
	on table public.pipelines to authenticated;

-- pipeline_id is insert-only: moving a stage to another board would strand
-- every deal sitting in it.
revoke insert, update on table public.pipeline_stages from authenticated;
grant insert (org_id, pipeline_id, name, sort_order, outcome, probability),
	update (name, sort_order, outcome, probability)
	on table public.pipeline_stages to authenticated;

-- deals: `stage` is gone, the two ids replace it. Both are writable — moving a
-- deal across the board, and between boards, is the everyday edit.
revoke insert, update on table public.deals from authenticated;
grant insert (org_id, company_id, contact_id, title, amount, pipeline_id, stage_id,
		expected_close_date, assigned_to, created_by),
	update (company_id, contact_id, title, amount, pipeline_id, stage_id,
		expected_close_date, assigned_to)
	on table public.deals to authenticated;
