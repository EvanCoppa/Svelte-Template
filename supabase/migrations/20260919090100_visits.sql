-- Visits: somebody went there
-- ===========================================================================
-- A visit is the fourth kind of "something written down against time", next
-- to the three the activities and calendar migrations already told apart:
--
--   activity   a moment that HAPPENED — logged after the fact, never edited
--   note       a document that stays OPEN — edited for weeks, never scheduled
--   event      a block of time that is PLANNED — drawn on a grid
--   visit      somebody WENT somewhere, and something came of it
--
-- The temptation is to make this an activity with a type, and the activities
-- migration's own header says as much ("the site visit on Friday"). Three
-- things make it its own table instead, and each is the reason a column here
-- could not live there:
--
--   it exists before it happens   a visit is planned, then completed or
--                                 missed. An activity is defined as a moment
--                                 that already happened, so a planned one
--                                 would sit on a record's timeline dated in
--                                 the future.
--   things point AT it            an activity is not a `crm_entity_type`, so
--                                 nothing can name one. A visit is attended
--                                 by members (a relationship, never a column
--                                 — the tasks rule), carries the industry's
--                                 own questions as custom fields, and holds
--                                 the photographs that prove it happened.
--   it is a page                  a list, a toolbar, a record page and a
--                                 grant ladder, all of which are keyed by a
--                                 feature that owns a route. Activities have
--                                 no feature and no list.
--
-- WHAT A VISIT IS ABOUT is the shared polymorphic link, not a column per
-- kind: a door knock is about a company, a home visit about a contact, a
-- survey about a deal, a showing about a property, a service call about an
-- asset. One table therefore serves a roofer, a distributor's field rep, a
-- beverage technician and a letting agent, and what the vertical CALLS it is
-- a row in `industry_features` ("Site visits", "Service calls", "Showings").
-- The link is NOT NULL: a visit to nobody cannot be found again, counted, or
-- shown on the record it was to.
--
-- WHAT IS NOT HERE, on purpose:
--
--   the follow-up      a booked lunch, a second survey, the callback. That is
--                      a `calendar_events` row against the same record, or a
--                      task — never a date column pair here, which can hold
--                      exactly one of each and drifts out of step with the
--                      thing it describes the moment either is moved.
--   the questionnaire  "practice size", "roof age", "lines cleaned". Those
--                      are facts about a VERTICAL, so they are
--                      `industry_custom_fields` for `entity_type = 'visit'`
--                      (the next migration), which also makes each one a
--                      column of the list with no code.
--   who attended       a relationship (`attended_by`, below), because a crew
--                      is two technicians and a ride-along is a rep and their
--                      manager. A column could hold one of them.
--   targets            "25 doors a day". They belong to the organization, not
--                      to a person, and nothing reads them yet: a limit
--                      nothing counts against reads as enforced (the rmas
--                      migration's rule). They land with the screen that
--                      shows them.
--   a route            a plan that GENERATES visits on a cadence. A real
--                      table, and it lands when something schedules from it.
--   where the fix      came from. Today the device is the only thing that sets
--                      a location, so a `location_source` column would have
--                      exactly one value and nothing to compare it against —
--                      the same dead weight a coupon's unread `max_redemptions`
--                      would be. It lands with the second way of setting one:
--                      a pin dropped on the map, or an address geocoded.

-- ---------------------------------------------------------------------------
-- The vocabularies
-- ---------------------------------------------------------------------------

-- Where the visit sits. `completed` exactly when `occurred_at` is set, held
-- there by trigger below — the task board's invariant, for the same reason:
-- WHERE it sits and WHEN it happened are two facts, and only one of them can
-- be honest about a time.
--
-- There is no `cancelled`: a visit that was called off was not made, which is
-- what `missed` says, and WHY is a sentence in `notes`. A second unmade state
-- would be the task board's `cancelled` mistake (the task_board migration).
create type public.visit_status as enum ('planned', 'completed', 'missed');

-- What a visit came to, coarsely — the axis every vertical shares, so a
-- funnel can be counted across industries while the WORDS stay the org's
-- (`visit_outcomes` below). Exactly the `stage_outcome` arrangement: an org
-- names as many outcomes as it likes, each resolving to one of these three.
--
--   engaged      somebody was spoken to, and the visit did what it was for
--   no_contact   nobody available, no access, information left at the door
--   declined     they were there and the answer was no
create type public.visit_result as enum ('engaged', 'no_contact', 'declined');

-- ---------------------------------------------------------------------------
-- visit_outcomes — the org's own words for how a visit went
-- ---------------------------------------------------------------------------
-- Rows rather than an enum, for the reason `pipeline_stages` are rows: a
-- roofer's "Needs a second survey" and a distributor's "Buyer not in" are not
-- the same list, and neither is a migration's business. Every org gets a
-- starter set by trigger (below) so nothing has to be configured before the
-- first visit is logged, and `result` is what keeps the set countable.

create table public.visit_outcomes (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	result public.visit_result not null,
	-- The pill's colour, from the ten tones the schema already owns (the
	-- activities migration promoted them from BadgeTone).
	tone public.badge_tone not null default 'neutral',
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target, so a visit can only name an outcome of its own org.
	unique (id, org_id),
	unique (org_id, name),
	constraint visit_outcomes_name_not_blank check (length(trim(name)) > 0),
	constraint visit_outcomes_name_length check (length(name) <= 80)
);

comment on table public.visit_outcomes is
	'How a visit went, in the org''s own words. Rows like pipeline_stages, because no two industries score a visit the same way; `result` folds every one of them onto the three-value axis a funnel can count.';
comment on column public.visit_outcomes.result is
	'The countable axis: engaged / no_contact / declined. The name is the org''s word for this outcome, the result is what it means.';

create index visit_outcomes_org_id_idx on public.visit_outcomes (org_id);

create trigger visit_outcomes_set_updated_at
	before update on public.visit_outcomes
	for each row execute procedure public.set_updated_at();

alter table public.visit_outcomes enable row level security;

create policy "Members can view visit outcomes"
	on public.visit_outcomes for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create visit outcomes"
	on public.visit_outcomes for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update visit outcomes"
	on public.visit_outcomes for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete visit outcomes"
	on public.visit_outcomes for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

revoke insert, update on table public.visit_outcomes from authenticated;
grant insert (org_id, name, result, tone, sort_order),
	update (name, result, tone, sort_order)
	on table public.visit_outcomes to authenticated;

-- ---------------------------------------------------------------------------
-- Every org gets a starter set
-- ---------------------------------------------------------------------------
-- The five a door knock, a service call and a showing all have in common,
-- worded plainly so an org can rename rather than invent. SECURITY DEFINER
-- for the reason create_default_pipeline is: the trigger runs as whoever
-- inserted the org, who has no policy on this table yet.
create function public.create_default_visit_outcomes(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.visit_outcomes (org_id, name, result, tone, sort_order) values
		(org, 'Follow-up booked', 'engaged', 'success', 100),
		(org, 'Spoke with someone', 'engaged', 'info', 200),
		(org, 'Left information', 'no_contact', 'neutral', 300),
		(org, 'Nobody available', 'no_contact', 'warning', 400),
		(org, 'Turned away', 'declined', 'error', 500)
	on conflict (org_id, name) do nothing;
end;
$$;

create function public.handle_new_organization_visit_outcomes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.create_default_visit_outcomes(new.id);
	return new;
end;
$$;

create trigger on_organization_created_visit_outcomes
	after insert on public.organizations
	for each row execute procedure public.handle_new_organization_visit_outcomes();

-- Backfill, idempotent: only orgs with no outcomes at all qualify, so an org
-- that deleted one of the five keeps its edit on a re-run.
do $$
declare
	org record;
begin
	for org in
		select o.id from public.organizations o
		where not exists (select 1 from public.visit_outcomes v where v.org_id = o.id)
	loop
		perform public.create_default_visit_outcomes(org.id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- visits — the record itself
-- ---------------------------------------------------------------------------

create table public.visits (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Who or what was visited. Not null, both of them: see the header.
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	status public.visit_status not null default 'completed',
	-- When it is meant to happen. Required while it has not: see
	-- `visits_planned_is_scheduled` below.
	scheduled_for timestamptz,
	-- When it did. Null until it has, and the one fact `status` is kept in
	-- step with.
	occurred_at timestamptz default now(),
	-- When they left. EXCLUSIVE, the calendar's rule, so time on site is one
	-- subtraction and is never stored: a duration column and two instants are
	-- two ways to say the same thing, and only one of them can be edited.
	ended_at timestamptz,
	outcome_id uuid,
	notes text,
	-- Where the visitor actually was. Coordinates rather than an address: a
	-- postal address belongs to the party (the `addresses` table, geocoded),
	-- and this is evidence of attendance, which is a different fact. The pair
	-- arrives together or not at all.
	latitude numeric(9, 6),
	longitude numeric(9, 6),
	location_accuracy_m numeric(10, 2),
	-- How the row got here. Not grantable: a client may not claim a visit was
	-- imported, and nothing else distinguishes the two.
	source text not null default 'logged',
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint visits_outcome_id_org_id_fkey
		foreign key (outcome_id, org_id) references public.visit_outcomes (id, org_id)
		on delete set null (outcome_id),
	-- The kinds you can go and see. Narrow on purpose, exactly as
	-- `addresses_entity_is_party` is: widening it later is dropping and
	-- replacing this one constraint (and adding the branch to
	-- `visitSubjectKinds` in src/lib/crm/visits.ts), never a second table.
	-- A visit is never about a visit, which also keeps the subject from
	-- recursing.
	constraint visits_subject_is_visitable
		check (entity_type in ('company', 'contact', 'deal', 'property', 'asset')),
	-- You can only miss something that was on the plan, and a visit still on
	-- the plan has to say when it is for.
	constraint visits_planned_is_scheduled
		check (status = 'completed' or scheduled_for is not null),
	constraint visits_ends_after_start
		check (ended_at is null or (occurred_at is not null and ended_at > occurred_at)),
	-- An outcome is what CAME of it, so there is nothing to record until it
	-- happened.
	constraint visits_outcome_needs_an_occurrence
		check (outcome_id is null or occurred_at is not null),
	constraint visits_coordinates_complete check (
		(latitude is null) = (longitude is null)
		and (latitude is null or latitude between -90 and 90)
		and (longitude is null or longitude between -180 and 180)
	),
	-- The radius is meaningless without a point to put it around.
	constraint visits_accuracy_with_coordinates
		check (location_accuracy_m is null or (latitude is not null and location_accuracy_m >= 0)),
	constraint visits_notes_length check (notes is null or length(notes) <= 5000),
	constraint visits_source_known check (source in ('logged', 'imported'))
);

comment on table public.visits is
	'Somebody went somewhere, about one CRM record, and something came of it — a door knocked, a site walked, a machine serviced, a property shown. Planned before it happens; who attended is a relationship, and what the vertical asks about it is a custom field.';
comment on column public.visits.ended_at is
	'Exclusive: the first instant the visitor was no longer there. Time on site is the subtraction, never a stored column.';
comment on column public.visits.status is
	'Where the visit sits. Kept in step with occurred_at by private.visits_sync_occurrence.';
comment on column public.visits.source is
	'How the row got here: ''logged'' = somebody recorded the visit, ''imported'' = it came from a system that went before. Not grantable to clients.';
comment on column public.visits.latitude is
	'Where the visitor was, not where the party is. Null when no location was captured.';

create index visits_org_id_idx on public.visits (org_id);
-- The list page: an org's visits, most recent first.
create index visits_org_id_occurred_at_idx on public.visits (org_id, occurred_at desc);
-- A record's own visit history — the question Yes Smile answered by reading
-- two thousand rows and matching names.
create index visits_entity_idx on public.visits (org_id, entity_type, entity_id, occurred_at desc);
-- What is still on the plan.
create index visits_org_id_status_idx on public.visits (org_id, status, scheduled_for);
create index visits_outcome_id_idx on public.visits (outcome_id);
create index visits_coordinates_idx on public.visits (latitude, longitude)
	where latitude is not null;

create trigger visits_set_updated_at
	before update on public.visits
	for each row execute procedure public.set_updated_at();

create trigger visits_check_entity
	before insert or update of org_id, entity_type, entity_id on public.visits
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- The one invariant
-- ---------------------------------------------------------------------------
-- `status = 'completed'` exactly when `occurred_at` is set — a trigger rather
-- than a constraint, for the reason `tasks_sync_completion` is one: a
-- constraint can only refuse a write, and what every caller wants is the
-- other column filled in for them. Whichever moved in this statement wins, so
-- the form writes `status` and a "log it now" action writes `occurred_at`,
-- and neither has to know the other column exists.
create function private.visits_sync_occurrence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if new.status = 'completed' and new.occurred_at is null then
		if tg_op = 'UPDATE' and old.occurred_at is not null and new.status = old.status then
			-- The timestamp was cleared and the status was not touched: the
			-- visit is being un-logged, so it goes back on the plan — at the
			-- time it was made, since a planned visit must say when it is for.
			new.status := 'planned';
			new.scheduled_for := coalesce(new.scheduled_for, old.occurred_at, now());
		else
			-- Marked completed without a time; it happened just now.
			new.occurred_at := now();
		end if;
	elsif new.status <> 'completed' and new.occurred_at is not null then
		if tg_op = 'UPDATE' and new.status is distinct from old.status then
			-- Moved back to planned or missed: it should not claim a time it
			-- was made at.
			new.occurred_at := null;
		else
			-- The timestamp was set on its own: a visit being logged.
			new.status := 'completed';
		end if;
	end if;

	-- A visit that did not happen did not end either, and nothing came of it.
	if new.occurred_at is null then
		new.ended_at := null;
		new.outcome_id := null;
	end if;

	return new;
end;
$$;

create trigger visits_sync_occurrence
	before insert or update on public.visits
	for each row execute procedure private.visits_sync_occurrence();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about visits
-- ---------------------------------------------------------------------------

create or replace function private.crm_entity_exists(org uuid, kind public.crm_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'asset' then exists (select 1 from public.assets where id = entity and org_id = org)
		when 'billable' then exists (select 1 from public.billables where id = entity and org_id = org)
		when 'company' then exists (select 1 from public.companies where id = entity and org_id = org)
		when 'contact' then exists (select 1 from public.contacts where id = entity and org_id = org)
		when 'coupon' then exists (select 1 from public.coupons where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
		when 'lease' then exists (select 1 from public.leases where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'order' then exists (select 1 from public.orders where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'property' then exists (select 1 from public.properties where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'rma' then exists (select 1 from public.rmas where id = entity and org_id = org)
		when 'shipment' then exists (select 1 from public.shipments where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		when 'visit' then exists (select 1 from public.visits where id = entity and org_id = org)
		else false
	end
$$;

-- A visit goes with the record it was to. It cannot detach the way a proposal
-- does: its subject is not nullable, so there is nothing to detach to — a
-- visit to nobody is a row that can never be found again.
create or replace function private.on_crm_entity_gone(org uuid, deleted_kind public.crm_entity_type, entity uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.notes
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.calendar_events
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	-- Before the generic deletes below: each visit's own trigger runs this
	-- function again for the visit, clearing its activities, tags, custom
	-- values and relationships.
	delete from public.visits
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.addresses
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.activities
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.taggings
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.custom_field_values
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.entity_images
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.relationships
	where org_id = org
		and ((from_type = deleted_kind and from_id = entity)
			or (to_type = deleted_kind and to_id = entity));
end;
$$;

create trigger visits_crm_entity_deleted
	after delete on public.visits
	for each row execute procedure public.on_crm_entity_deleted('visit');

-- A visit is photographed more often than anything else here: the roof before
-- the quote, the cooler that was leaking, the room at check-out. Widening is
-- replacing the one constraint, as its own comment has said since assets.
alter table public.entity_images drop constraint entity_images_entity_is_asset_or_property;
alter table public.entity_images
	add constraint entity_images_entity_has_pictures
		check (entity_type in ('asset', 'property', 'visit'));

comment on constraint entity_images_entity_has_pictures on public.entity_images is
	'The kinds that have pictures. Widen by replacing this constraint, never by adding a second mechanism — and the name no longer lists them, so the next widening is one line.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, like tickets and tasks: the whole team records and corrects
-- visits, deletes stay owner/admin. Who may see the page at all, and who may
-- log one, is the `visits` feature's grant ladder in app code — a visit log
-- is not a security boundary the way the staff roster is (its rows carry join
-- tokens), so this stays the canonical member shape.

alter table public.visits enable row level security;

create policy "Members can view visits"
	on public.visits for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create visits as themselves"
	on public.visits for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update visits"
	on public.visits for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete visits"
	on public.visits for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- `source` is the server's: a client may not claim a visit was imported.
-- org_id and authorship are immutable from the browser, as everywhere.

revoke insert, update on table public.visits from authenticated;
grant insert (org_id, entity_type, entity_id, status, scheduled_for, occurred_at, ended_at,
		outcome_id, notes, latitude, longitude, location_accuracy_m, created_by),
	update (entity_type, entity_id, status, scheduled_for, occurred_at, ended_at,
		outcome_id, notes, latitude, longitude, location_accuracy_m)
	on table public.visits to authenticated;

-- ---------------------------------------------------------------------------
-- Who went
-- ---------------------------------------------------------------------------
-- A relationship, not a column — the rule tasks established (docs/tasks.md):
-- a crew is two technicians, a ride-along is a rep and their manager, and
-- unassigning sets `ended_on` rather than deleting, so a handover is history.
-- `created_by` still says who typed the row up, which is a different fact and
-- stays a column.
--
-- Scoped to visits for now. Widening a type is always safe (the relationships
-- migration says so: the scope check only refuses a row it already refused).
--
-- The id starts a fresh block deliberately: the 0031/0032 pair is taken twice
-- over (see below), and a system type's id is the name app code calls it by.
insert into public.relationship_types (id, key, forward_label, inverse_label, source_type, target_type) values
	('f0000000-0000-0000-0000-000000000041', 'attended_by', 'attended by', 'attended', 'visit', 'member')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Two system types that were never actually inserted
-- ---------------------------------------------------------------------------
-- `proposal_graph_edges` (20260914090000) ships `presents` and `proposed_to`
-- at ids 0031 and 0032 — the same two the properties-and-leases migration had
-- already given to `services` and `located_at`. Its `on conflict (id) do
-- nothing` therefore skipped both rows silently, and `RELATIONSHIP_TYPE` in
-- src/lib/server/crm/relationships.ts has been pointing at the wrong rows ever
-- since: on /graph, a proposal's presenter edge reads "services" and its
-- parent link reads "located at".
--
-- Nothing references the missing types — the proposal edges are synthesised at
-- read time and never written to `relationships` (that migration explains
-- why) — so giving them free ids is safe, and the constants move with them.
-- Found while adding `attended_by` next door, which would have been the third
-- row to land on the same collision.
insert into public.relationship_types (id, key, forward_label, inverse_label, source_type, target_type) values
	('f0000000-0000-0000-0000-000000000033', 'presents', 'presents', 'presented by', 'member', 'proposal'),
	('f0000000-0000-0000-0000-000000000034', 'proposed_to', 'proposed to', 'has proposal', 'proposal', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A regression this feature cannot be built on top of
-- ---------------------------------------------------------------------------
-- `public.on_crm_entity_deleted()` is supposed to be the one-line adapter the
-- relationships migration made it: `old.id` in, `private.on_crm_entity_gone`
-- out, one place that says what happens when a record goes. The entity_images
-- migration (20260911090300) replaced the whole function to add its own
-- delete, and in doing so dropped the branches four earlier migrations had
-- added — notes, calendar events, activities, taggings and custom field
-- values — along with the call itself. Since then, deleting a company has
-- left its timeline, its tags, its custom values and its relationships
-- behind, and `on_crm_entity_gone` has only been reached when a member left
-- the org.
--
-- Visits cannot be built on that: a visit's subject is not nullable, so it
-- has to go when its record does, and its own satellites have to go with it.
-- So the adapter is restored here, and the image delete has moved up into
-- `on_crm_entity_gone` above, where every other dependent table's already
-- lives — which is what stops the next migration making the same mistake.
--
-- Rows already orphaned are left alone: nothing reads a satellite whose
-- parent is gone, and a sweep would have to guess at a parent per kind.
create or replace function public.on_crm_entity_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform private.on_crm_entity_gone(old.org_id, tg_argv[0]::public.crm_entity_type, old.id);
	return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under CRM, after the properties and leases and before assets: going
-- to see someone is front-line work, not back-office. The three verticals
-- that order their own CRM section place it themselves (below); everyone
-- else inherits this.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('visits', 'Visits', 'visit',
		'Where your people went, what came of it, and what is still on the plan.',
		'/visits', 'route', 'crm', 25)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('visits', 'visits', '/visits', null)
on conflict (id) do nothing;

-- The verticals whose people go out, each with its own word for it. A
-- practice and a clinic are where the patient comes TO, so the feature is
-- `hidden` for dentistry and cosmetic — they have no row here at all.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'visits', null, null),
	-- A roofer walks the roof before quoting it.
	('roofing', 'visits', 'Site visits', 'site visit'),
	-- A technician is dispatched to a machine.
	('beverage', 'visits', 'Service calls', 'service call'),
	-- A rep calls on the buyer. `noun` is lower case by constraint (the
	-- feature_names_by_industry migration) — it is the word a sentence uses,
	-- "3 field calls", not a heading.
	('medical-supplies', 'visits', 'Field calls', 'field call'),
	-- An agent shows the unit.
	('real-estate', 'visits', 'Showings', 'showing'),
	-- An account manager calls on the merchant.
	('merchant-services', 'visits', 'Merchant visits', 'merchant visit')
on conflict (industry_id, feature_id) do nothing;

-- Every plan: going to see a customer is not a premium feature.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'visits'),
	('pro', 'visits'),
	('enterprise', 'visits')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work tasks may record visits, at the same level: field
-- work is work, and every industry's ladder already covers tasks.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'visits', rp.level
from public.role_permissions rp
where rp.feature_id = 'tasks'
on conflict (role_id, feature_id) do nothing;

-- The verticals that order their whole CRM section themselves (the
-- industry_feature_order migration) need a place for the newcomer — a section
-- with some rows ordered and the rest inheriting reads as two interleaved
-- lists. Each puts the visit where its day starts: a roofer surveys before
-- quoting, a rep calls before writing the order, a technician's round is the
-- job. Dentistry orders its section too and is deliberately absent: it has no
-- row above, so the feature is hidden there whatever the order says.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('roofing', 'visits', 150),
	('medical-supplies', 'visits', 350),
	('beverage', 'visits', 250)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- Who was visited first and searchable (it is the link into the visit), then
-- the two things a reader scans for — where it sits and what came of it, both
-- filterable — then when. The scheduled time is a column the reader can
-- switch on rather than one everybody carries: most visits have happened.
-- Notes are searched but not shown: a sentence is not a value.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('visits', 'name', true, true, false, 100),
	('visits', 'status', true, false, true, 200),
	('visits', 'outcome', true, true, true, 300),
	('visits', 'occurred_at', true, false, false, 400),
	('visits', 'scheduled_for', false, false, false, 500),
	('visits', 'notes', false, true, false, 600),
	('visits', 'created_at', false, false, false, 700)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
