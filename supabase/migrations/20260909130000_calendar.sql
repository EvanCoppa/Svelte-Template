-- Calendar: the schedule an org runs its week on, and the feature that draws it.
--
-- A calendar event is a THIRD kind of "something written down against time",
-- next to the two the activities and notes migrations already told apart:
--
--   activity   a moment that HAPPENED — logged after the fact, never edited
--   note       a document that stays OPEN — edited for weeks, never scheduled
--   event      a block of time that is PLANNED — a site visit, a consultation,
--              a demo, a cleaning; moved, stretched and cancelled until it is
--              over, and read off a grid rather than a list
--
-- A task is not an event either: a task is DUE, an event OCCUPIES. Folding
-- events into `tasks.due_at` would make every appointment a to-do that can
-- be "completed" and every to-do a block on the calendar, so events are
-- their own table with a start AND an end, and the calendar page draws only
-- these. Ported from Yes Smile's appointment schedule, generalised the way
-- proposals were: the shape is the same for a dental practice and a roofer,
-- and what the industry calls the page ("Schedule", one "appointment") is a
-- row in industry_features, never a constant.
--
-- An event may point at the CRM record it is for — the patient, the account,
-- the deal — through the shared (entity_type, entity_id) link, exactly as a
-- note may; the pair is nullable because a team stand-up is about nobody.
-- Nothing points AT an event: it is not a `crm_entity_type`, has no record
-- page and no list row, because an event is read where it is drawn.
--
-- Times are instants (timestamptz), both of them, and `ends_at` is EXCLUSIVE:
-- a 9:00–10:00 meeting ends at 10:00 sharp, and an all-day event on the 10th
-- runs from local midnight on the 10th to local midnight on the 11th, the way
-- iCalendar's DTEND does. That is what makes "overlaps this range" one
-- comparison (starts_at < range_end and ends_at > range_start), a multi-day
-- event one row, and drag-to-resize a change to one column. The browser
-- decides what "local" means; the server only ever compares instants.
--
-- Tenancy follows tasks: working data, member-writable (the whole team moves
-- appointments around), owner/admin delete, column grants keeping org_id and
-- authorship immutable from the browser, and the assignee pinned to a
-- membership by the composite foreign key deals and tasks already use.

create table public.calendar_events (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- What the event is for, when it is for anything: the patient the
	-- appointment is with, the deal the demo is closing.
	entity_type public.crm_entity_type,
	entity_id uuid,
	title text not null,
	description text,
	-- Where, as typed: a room, an address, a video link. Free text on purpose;
	-- a structured address belongs to the party, through `addresses`.
	location text,
	starts_at timestamptz not null,
	-- Exclusive — see the header comment.
	ends_at timestamptz not null,
	-- An all-day event still carries both instants (local midnight to local
	-- midnight); the flag says how to DRAW it, not how to store it.
	all_day boolean not null default false,
	-- The block's colour, from the ten tones the app already owns (the
	-- activities migration promoted them from BadgeTone). Blue is the default
	-- because the calendar's own accent is.
	color public.badge_tone not null default 'info',
	-- Whose event it is — the provider, the estimator, the rep. Same
	-- membership key as deals.assigned_to: never someone outside the org, and
	-- leaving the org clears it rather than dangling it.
	assigned_to uuid,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (org_id, assigned_to) references public.organization_members (org_id, user_id)
		on delete set null (assigned_to),
	constraint calendar_events_entity_link_complete
		check ((entity_type is null) = (entity_id is null)),
	constraint calendar_events_title_not_blank check (length(trim(title)) > 0),
	constraint calendar_events_title_length check (length(title) <= 200),
	constraint calendar_events_location_length
		check (location is null or length(location) <= 200),
	constraint calendar_events_description_length
		check (description is null or length(description) <= 5000),
	-- Zero-length events do not exist: a moment is an activity.
	constraint calendar_events_ends_after_start check (ends_at > starts_at)
);

comment on table public.calendar_events is
	'A planned block of time — an appointment, a site visit, a demo — drawn on the org''s calendar. Optionally for one CRM record through the shared entity link. Not an activity (a moment that happened) and not a task (something due).';
comment on column public.calendar_events.ends_at is
	'Exclusive: the first instant the event no longer occupies. An all-day event ends at the next local midnight.';
comment on column public.calendar_events.all_day is
	'How to draw it, not how to store it — both instants are still set.';
comment on column public.calendar_events.assigned_to is
	'The member whose event it is. A membership, so it clears when they leave the org.';

create index calendar_events_org_id_idx on public.calendar_events (org_id);
-- The grid: everything overlapping a visible range, in start order.
create index calendar_events_org_starts_at_idx
	on public.calendar_events (org_id, starts_at, ends_at);
-- One record's events, the way a record page would read them.
create index calendar_events_entity_idx
	on public.calendar_events (org_id, entity_type, entity_id);
create index calendar_events_assigned_to_idx on public.calendar_events (assigned_to);

create trigger calendar_events_set_updated_at
	before update on public.calendar_events
	for each row execute procedure public.set_updated_at();

create trigger calendar_events_check_entity
	before insert or update of org_id, entity_type, entity_id on public.calendar_events
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- What happens when the record an event points at is deleted
-- ---------------------------------------------------------------------------

-- The one cleanup function grows one branch (the party-model migration's
-- rule). Events DETACH, like proposals and notes: the consultation on the
-- 12th still happened — or is still happening — whether or not the patient
-- record survives, and deleting a company should not silently empty a week
-- someone has already planned around.
create or replace function public.on_crm_entity_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	-- Not named `kind`: `addresses` has a column by that name, and plpgsql
	-- resolves the variable first, which would silently match every row.
	deleted_kind public.crm_entity_type := tg_argv[0]::public.crm_entity_type;
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	update public.notes
	set entity_type = null, entity_id = null
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	update public.calendar_events
	set entity_type = null, entity_id = null
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.addresses
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.activities
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.taggings
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.custom_field_values
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.calendar_events enable row level security;

-- Working data, exactly like tasks: the people who keep the schedule are
-- the members, and moving a colleague's appointment is the calendar working
-- as intended. Deletes stay owner/admin.
create policy "Members can view calendar events"
	on public.calendar_events for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create calendar events as themselves"
	on public.calendar_events for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update calendar events"
	on public.calendar_events for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete calendar events"
	on public.calendar_events for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS.
-- org_id and created_by are insert-only, so an event can never be moved
-- between orgs or re-authored. The entity link is updatable, like a note's:
-- an appointment is booked first and attached to the patient it turned out
-- to be for afterwards.
revoke insert, update on table public.calendar_events from authenticated;
grant insert (org_id, entity_type, entity_id, title, description, location, starts_at, ends_at,
		all_day, color, assigned_to, created_by),
	update (entity_type, entity_id, title, description, location, starts_at, ends_at, all_day,
		color, assigned_to)
	on table public.calendar_events to authenticated;

-- ---------------------------------------------------------------------------
-- The registry rows: /calendar exists
-- ---------------------------------------------------------------------------
-- The migration that adds a route registers it (the features migration's
-- closing checklist). First in the CRM section: the schedule is the screen a
-- working day opens on.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('calendar', 'Calendar', 'event',
		'The week at a glance: appointments, visits and demos, dragged into place.',
		'/calendar', 'calendar-days', 'crm', 5)
on conflict (id) do nothing;

-- No title of its own: the page is named by its feature, as the org's
-- industry says it.
insert into public.pages (id, feature_id, path, title) values
	('calendar', 'calendar', '/calendar', null)
on conflict (id) do nothing;

-- Every vertical keeps a schedule, so the rows are derived (an industry added
-- later cannot silently miss the feature). The two that book people rather
-- than jobs say it in their own words — a practice has a "Schedule" of
-- "appointments"; everyone else inherits "Calendar" / "event".
insert into public.industry_features (industry_id, feature_id, name, noun)
select
	i.id,
	'calendar',
	case when i.id in ('dentistry', 'cosmetic') then 'Schedule' end,
	case when i.id in ('dentistry', 'cosmetic') then 'appointment' end
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan, including free: a CRM whose free tier cannot book a meeting is
-- not much of a CRM.
insert into public.tier_features (tier_id, feature_id)
select t.id, 'calendar'
from public.tiers t
on conflict (tier_id, feature_id) do nothing;

-- The ladder rungs, listed the way the catalog and every feature migration
-- since list them, joined to industry_features so an industry that lacks the
-- feature grants nothing.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0001-000000000001'::uuid, 'crm', 'read'::public.permission_level),
	('b0000000-0000-0000-0001-000000000003', 'crm', 'manage'),
	('b0000000-0000-0000-0001-000000000004', 'crm', 'delete'),
	('b0000000-0000-0000-0002-000000000001', 'roofing', 'read'),
	('b0000000-0000-0000-0002-000000000004', 'roofing', 'manage'),
	('b0000000-0000-0000-0002-000000000005', 'roofing', 'delete'),
	('b0000000-0000-0000-0003-000000000001', 'medical-supplies', 'read'),
	('b0000000-0000-0000-0003-000000000005', 'medical-supplies', 'manage'),
	('b0000000-0000-0000-0003-000000000006', 'medical-supplies', 'delete'),
	('b0000000-0000-0000-0004-000000000001', 'cosmetic', 'read'),
	('b0000000-0000-0000-0004-000000000005', 'cosmetic', 'manage'),
	('b0000000-0000-0000-0004-000000000006', 'cosmetic', 'delete'),
	('b0000000-0000-0000-0005-000000000001', 'dentistry', 'read'),
	('b0000000-0000-0000-0005-000000000005', 'dentistry', 'manage'),
	('b0000000-0000-0000-0005-000000000006', 'dentistry', 'delete'),
	('b0000000-0000-0000-0006-000000000001', 'beverage', 'read'),
	('b0000000-0000-0000-0006-000000000005', 'beverage', 'manage'),
	('b0000000-0000-0000-0006-000000000006', 'beverage', 'delete')
) as ladder (role_id, industry_id, level)
join public.industry_features f
	on f.industry_id = ladder.industry_id and f.feature_id = 'calendar'
on conflict (role_id, feature_id) do nothing;

-- The specialists, derived from what each role can already do with tasks
-- rather than listed: whoever schedules the follow-ups schedules the visits,
-- at the same level — a hygienist books appointments, a viewer reads them.
-- The ladder above ran first, so a Director keeps `delete`.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'calendar', rp.level
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.industry_features f
	on f.industry_id = r.industry_id and f.feature_id = 'calendar'
where rp.feature_id = 'tasks'
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Deliberately not here
-- ---------------------------------------------------------------------------
-- Attendees beyond one: a join table onto the membership, the day a meeting
-- needs more than the person it belongs to. Recurrence: an RRULE column and
-- an expansion in the load, not a row per occurrence. Reminders: the
-- notifications table already exists for them. Each is one migration; none
-- is a second mechanism for what is here.
