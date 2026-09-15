-- An industry ships its own funnel, the way it ships its own custom fields.
--
-- Every org has been born on the same generic "Sales" board (Lead → Qualified
-- → Proposal → Negotiation → Won/Lost) since the pipelines migration, and two
-- verticals already prove that is the wrong board for them: the seed data
-- renames Keystone Payments' and Ironwood Property Group's default pipeline
-- and replaces its stages by hand, org by org, right after inserting them.
-- That was always a fixture's workaround, not the intended shape — a real org
-- onboarded into either vertical tomorrow still starts on "Lead → Qualified"
-- until someone visits Settings and rebuilds the funnel a rep at that company
-- already knows by heart.
--
-- So the industry ships the funnel, the same way industry_custom_fields ships
-- a vertical's fields: a template `create_default_pipeline()` copies from
-- INSTEAD of the six hardcoded stages, for the org's industry, at the moment
-- the org is created. Unlike custom fields, this is create-time only — no
-- backfill loop, and no trigger on `industry_id` changing:
--
--   * A deal is already sitting in a stage. Regenerating the board out from
--     under it is not a courtesy, it is silent data loss (a deal's stage
--     belongs to its own pipeline, so replacing the stage set orphans it).
--   * The whole reason pipelines are rows and not an enum (see that
--     migration's own comment) is that an org's funnel is ITS data from the
--     moment it exists — the industry only supplies where a new org starts.
--
-- An org whose industry has no row here still gets the original six-stage
-- board — the fallback is the same stages, in the same function, not a
-- second code path.

-- ---------------------------------------------------------------------------
-- industry_pipelines — the board's own name and description, per industry
-- ---------------------------------------------------------------------------
-- Optional: an industry with no row here keeps "Sales" / the generic
-- description, exactly as `industry_pipeline_stages` falls back to the six
-- generic stages.

create table public.industry_pipelines (
	industry_id text not null primary key references public.industries (id) on delete cascade,
	name text not null,
	description text,
	created_at timestamptz not null default now(),
	constraint industry_pipelines_name_not_blank check (length(trim(name)) > 0)
);

comment on table public.industry_pipelines is
	'The name and description an industry gives the default pipeline it ships, if any. An industry absent here gets "Sales" and the generic description.';

-- ---------------------------------------------------------------------------
-- industry_pipeline_stages — what an industry ships
-- ---------------------------------------------------------------------------

create table public.industry_pipeline_stages (
	industry_id text not null references public.industries (id) on delete cascade,
	name text not null,
	sort_order integer not null,
	outcome public.stage_outcome not null default 'open',
	probability numeric(5, 2),
	created_at timestamptz not null default now(),
	primary key (industry_id, sort_order),
	unique (industry_id, name),
	constraint industry_pipeline_stages_name_not_blank check (length(trim(name)) > 0),
	constraint industry_pipeline_stages_probability_is_percent
		check (probability is null or probability between 0 and 100)
);

comment on table public.industry_pipeline_stages is
	'The stages an industry ships for its default pipeline, copied into every new org''s board at creation (create_default_pipeline). Reference data owned by migrations — never a backfill, and never re-applied when an org''s industry changes: an existing board is the org''s own from the moment it exists.';

-- ---------------------------------------------------------------------------
-- create_default_pipeline draws from the catalog, falling back to the six
-- generic stages when the org's industry ships none
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
		insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
		select org, pipeline, s.name, s.sort_order, s.outcome, s.probability
		from public.industry_pipeline_stages s
		where s.industry_id = industry
		order by s.sort_order;
	else
		-- The stages the `deal_stage` enum carried, unchanged from the
		-- original migration: an org whose industry ships nothing still gets
		-- exactly the board it always has.
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
-- The funnels the shipped industries carry
-- ---------------------------------------------------------------------------
-- Merchant services — the ten stages a real ISO named in its build brief
-- (docs/discovery/gsp-brief-gap-analysis.md), moved here verbatim from the
-- fixture that used to hand-build them per org in seed.sql.

insert into public.industry_pipelines (industry_id, name, description) values
	('merchant-services', 'Merchant boarding', 'Cold lead to first batch.'),
	('real-estate', 'Acquisitions', 'A building you have looked at, to a building you own.')
on conflict (industry_id) do nothing;

insert into public.industry_pipeline_stages (industry_id, name, sort_order, outcome, probability) values
	('merchant-services', 'Prospect', 10, 'open', 5),
	('merchant-services', 'Contacted', 20, 'open', 10),
	('merchant-services', 'Waiting on Statements', 30, 'open', 20),
	('merchant-services', 'Presentation Scheduled', 40, 'open', 35),
	('merchant-services', 'Proposal Sent', 50, 'open', 50),
	('merchant-services', 'Application Sent', 60, 'open', 70),
	('merchant-services', 'Underwriting', 70, 'open', 80),
	('merchant-services', 'Approved', 80, 'open', 90),
	('merchant-services', 'Installed / Live', 90, 'won', 100),
	('merchant-services', 'Lost', 100, 'lost', 0),

	-- Real estate — buying the next building (also moved from seed.sql).
	('real-estate', 'Identified', 10, 'open', 5),
	('real-estate', 'Offer made', 20, 'open', 25),
	('real-estate', 'Under contract', 30, 'open', 50),
	('real-estate', 'Due diligence', 40, 'open', 70),
	('real-estate', 'Financing', 50, 'open', 85),
	('real-estate', 'Closed', 60, 'won', 100),
	('real-estate', 'Passed', 70, 'lost', 0)
on conflict (industry_id, name) do nothing;

-- No backfill loop here, deliberately — see the header comment. Keystone
-- Payments, Cobalt Merchant Services, Ironwood Property Group and Larkspur
-- Rentals already carry the boards seed.sql built for them by hand; a fresh
-- `db:reset` now builds those same boards through this function instead
-- (seed.sql's own hand-built version was simplified alongside this
-- migration), and any other existing organization's board is untouched.

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.industry_pipelines enable row level security;
alter table public.industry_pipeline_stages enable row level security;

-- Reference data, like industry_custom_fields: readable by every signed-in
-- user, select-only — no write policies, so only migrations / the service
-- role change it.
create policy "Authenticated users can read the industry pipelines"
	on public.industry_pipelines for select to authenticated
	using (true);

create policy "Authenticated users can read the industry pipeline stages"
	on public.industry_pipeline_stages for select to authenticated
	using (true);

revoke insert, update on table public.industry_pipelines from authenticated;
revoke insert, update on table public.industry_pipeline_stages from authenticated;

-- ---------------------------------------------------------------------------
-- Giving an industry its own funnel, after this
-- ---------------------------------------------------------------------------
-- Insert its industry_pipeline_stages rows (and an industry_pipelines row if
-- "Sales" is the wrong name for it). No code, no backfill: a new org in that
-- industry gets it from `create_default_pipeline()`; an org already running
-- keeps its own board and reshapes it from Settings, exactly as it does
-- today.
