-- Industry-default pipelines: the gap the pipelines and merchant-services
-- migrations both flagged, closed.
-- ===========================================================================
-- `create_default_pipeline()` (crm_pipelines migration) gives every new org
-- the same six-stage generic "Sales" board, and its own comment names the
-- fix: "a table of per-industry defaults plus a trigger beside the pipeline
-- trigger". merchant_services_industry and merchant_services_terminology
-- repeat the same note — the real funnel a payment-processor brief named
-- (Prospect through Installed/Live) is per-org working data, so it could not
-- live in an industry's rows, and a real org onboarded tomorrow still got the
-- generic board. roofing_industry_depth and real_estate_industry's own
-- pipelines are per-org fixtures in seed.sql for the same reason.
--
-- This migration is that table, generic across every industry rather than
-- merchant-services-specific, so the next vertical that wants its own default
-- board is a data insert, not a second migration:
--
--   industry_default_pipelines        the name/description of the pipeline an
--                                      industry wants a new org to start with.
--   industry_default_pipeline_stages  that pipeline's starting stages.
--
-- `create_default_pipeline()` becomes industry-aware: an industry with rows
-- here gets its own named board and stage set; every other industry (every
-- one but merchant-services, as of this migration) keeps the generic
-- six-stage "Sales" board exactly as before — so this changes behaviour for
-- merchant-services alone, the same promise merchant_services_industry made
-- about itself.
--
-- The stage set is the ten names the brief gave
-- (docs/discovery/gsp-brief-gap-analysis.md), plus the two things the
-- template's own user explicitly wants represented that the brief's shorthand
-- "Installed / Live" and bare "Underwriting" collapsed:
--
--   Installed / Live -> Installed, Live   Two stages, not one comment with a
--       slash in it — a board column per state, matching every other stage.
--       Both close the deal (`won`): the funnel's own next act is Live, not a
--       sale that might still fall through, so nothing past Approved is still
--       "open" the way earlier stages are.
--   Underwriting -> Underwriting, Approved, Denied   The decision has to be a
--       stage of its own (a deal not yet decided) with two outcomes once it
--       is: Approved does NOT close the sale on its own — installation and go
--       live still have to happen, so it stays `open` — while Denied is
--       terminal for this application (`lost`); an office that wants to
--       retry a denied merchant works that as a new deal, not a re-open of
--       this one, which is what `lost` already means for 'Lost' itself.
--
-- The board these show up on needs no change to read them: `buildDealColumns`
-- (src/lib/crm/deals.ts) already gives every `open` stage its own column and
-- folds every closed one (`won` or `lost`, however many an org has) into one
-- `Closed` column split into a drop zone per stage — so Approved gets a
-- column of its own, and Installed / Live / Denied / Lost each land in their
-- own zone of the one Closed column with no new UI. No group/substatus column
-- is added to `pipeline_stages`: CLAUDE.md's rule for the task board's status
-- groups applies here too ("a group is never a value written to a row") — the
-- five higher-level buckets a rep would name this board's stages into
-- (Prospecting: Prospect, Contacted · Qualification: Waiting on Statements,
-- Presentation Scheduled, Proposal Sent, Application Sent · Underwriting:
-- Underwriting, Approved, Denied · Closed Won: Installed, Live · Closed Lost:
-- Lost) are exactly the walk `sort_order` already puts them in, contiguously,
-- and are documented here rather than built as a second grouping mechanism
-- the board does not ask for.

-- ---------------------------------------------------------------------------
-- industry_default_pipelines / industry_default_pipeline_stages
-- ---------------------------------------------------------------------------

create table public.industry_default_pipelines (
	industry_id text not null primary key references public.industries (id) on delete cascade,
	name text not null,
	description text,
	constraint industry_default_pipelines_name_not_blank check (length(trim(name)) > 0)
);

comment on table public.industry_default_pipelines is
	'Name/description of the pipeline create_default_pipeline() gives a new org in this industry. An industry absent here keeps the generic "Sales" board. Reference data owned by migrations.';

create table public.industry_default_pipeline_stages (
	industry_id text not null references public.industries (id) on delete cascade,
	name text not null,
	sort_order integer not null default 0,
	outcome public.stage_outcome not null default 'open',
	probability numeric(5, 2),
	primary key (industry_id, name),
	constraint industry_default_pipeline_stages_name_not_blank check (length(trim(name)) > 0),
	constraint industry_default_pipeline_stages_probability_is_percent
		check (probability is null or probability between 0 and 100)
);

comment on table public.industry_default_pipeline_stages is
	'The stages create_default_pipeline() writes for a new org in this industry, in place of the generic six. Reference data owned by migrations.';

alter table public.industry_default_pipelines enable row level security;
alter table public.industry_default_pipeline_stages enable row level security;

create policy "Authenticated users can read the industry default pipelines"
	on public.industry_default_pipelines for select to authenticated
	using (true);

create policy "Authenticated users can read the industry default pipeline stages"
	on public.industry_default_pipeline_stages for select to authenticated
	using (true);

-- Reference data like industry_custom_fields: no write policies, so only
-- migrations / the service role change either table.
revoke insert, update on table public.industry_default_pipelines from authenticated;
revoke insert, update on table public.industry_default_pipeline_stages from authenticated;

-- ---------------------------------------------------------------------------
-- create_default_pipeline() becomes industry-aware
-- ---------------------------------------------------------------------------
-- Same signature, same trigger (on_organization_created_pipeline, from the
-- crm_pipelines migration) — replacing the body is the whole change. An
-- industry with no rows in the two tables above falls through to the same six
-- stages this function has always written, so every existing industry's new
-- orgs are unaffected.

create or replace function public.create_default_pipeline(org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	pipeline uuid;
	org_industry text;
	pipeline_name text;
	pipeline_description text;
begin
	select o.industry_id into org_industry from public.organizations o where o.id = org;

	select d.name, d.description into pipeline_name, pipeline_description
	from public.industry_default_pipelines d
	where d.industry_id = org_industry;

	insert into public.pipelines (org_id, name, description, is_default)
	values (
		org,
		coalesce(pipeline_name, 'Sales'),
		coalesce(pipeline_description, 'The default pipeline every organization starts with.'),
		true
	)
	returning id into pipeline;

	if exists (
		select 1 from public.industry_default_pipeline_stages s where s.industry_id = org_industry
	) then
		insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
		select org, pipeline, s.name, s.sort_order, s.outcome, s.probability
		from public.industry_default_pipeline_stages s
		where s.industry_id = org_industry;
	else
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
-- Merchant services' own board
-- ---------------------------------------------------------------------------

insert into public.industry_default_pipelines (industry_id, name, description) values
	('merchant-services', 'Merchant boarding', 'Cold lead to first batch.')
on conflict (industry_id) do nothing;

insert into public.industry_default_pipeline_stages
	(industry_id, name, sort_order, outcome, probability) values
	('merchant-services', 'Prospect', 10, 'open', 5),
	('merchant-services', 'Contacted', 20, 'open', 10),
	('merchant-services', 'Waiting on Statements', 30, 'open', 20),
	('merchant-services', 'Presentation Scheduled', 40, 'open', 35),
	('merchant-services', 'Proposal Sent', 50, 'open', 50),
	('merchant-services', 'Application Sent', 60, 'open', 70),
	('merchant-services', 'Underwriting', 70, 'open', 80),
	('merchant-services', 'Approved', 80, 'open', 90),
	('merchant-services', 'Denied', 90, 'lost', 0),
	('merchant-services', 'Installed', 100, 'won', 100),
	('merchant-services', 'Live', 110, 'won', 100),
	('merchant-services', 'Lost', 120, 'lost', 0)
on conflict (industry_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Existing orgs: only the ones the generic board never left
-- ---------------------------------------------------------------------------
-- A merchant-services org created before this migration already has a
-- pipeline — the generic one, or one an owner has since reshaped. Only the
-- first kind is safe to touch: this loop matches a default pipeline named
-- exactly 'Sales' whose stage set is exactly the six generic names, which is
-- what create_default_pipeline() writes and nothing else. That is as far as
-- "still the untouched default" can be told apart from "an owner renamed it
-- back to something that happens to match" — a decision purely on names, like
-- the rest of this schema. An org outside that match (renamed board, added or
-- removed a stage) is left exactly as it is.
--
-- Idempotent: once converted, a pipeline's name is 'Merchant boarding', not
-- 'Sales', so a second run of this migration matches nothing.
do $$
declare
	org record;
begin
	for org in
		select p.id as pipeline_id, p.org_id
		from public.organizations o
		join public.pipelines p on p.org_id = o.id and p.is_default
		where o.industry_id = 'merchant-services'
			and p.name = 'Sales'
			and (
				select array_agg(s.name order by s.name)
				from public.pipeline_stages s
				where s.pipeline_id = p.id
			) = array['Lead', 'Lost', 'Negotiation', 'Proposal', 'Qualified', 'Won']::text[]
	loop
		update public.pipelines
		set name = 'Merchant boarding', description = 'Cold lead to first batch.'
		where id = org.pipeline_id;

		-- An UPSERT, not an insert: the generic board already has a 'Lost'
		-- stage, so conflict-skipping would leave it at the generic board's
		-- position (60) instead of this vertical's (120).
		insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
		select org.org_id, org.pipeline_id, s.name, s.sort_order, s.outcome, s.probability
		from public.industry_default_pipeline_stages s
		where s.industry_id = 'merchant-services'
		on conflict (pipeline_id, name) do update
			set sort_order = excluded.sort_order,
				outcome = excluded.outcome,
				probability = excluded.probability;

		-- The five generic stages this vertical's board does not reuse
		-- ('Lost' is shared by name, updated above). Guarded on nothing
		-- referencing them: a deal already sitting in 'Lead' stays there
		-- rather than losing its stage out from under it.
		delete from public.pipeline_stages s
		where s.pipeline_id = org.pipeline_id
			and s.name not in (
				select name from public.industry_default_pipeline_stages
				where industry_id = 'merchant-services'
			)
			and not exists (select 1 from public.deals d where d.stage_id = s.id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Giving an industry its own default board, after this
-- ---------------------------------------------------------------------------
-- Insert its industry_default_pipelines row (name, description) and its
-- industry_default_pipeline_stages rows (name, sort_order, outcome,
-- probability); write the same "orgs still on the untouched generic board"
-- loop as above, scoped to the new industry_id, for any org already in it.
-- New orgs need nothing further — the trigger already calls
-- create_default_pipeline(), which now reads these tables first.
