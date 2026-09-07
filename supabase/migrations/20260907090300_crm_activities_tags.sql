-- Activities and tags: the two things every CRM record accumulates.
--
-- crm_core shipped `notes`, which answers "what did someone write about this
-- client" and nothing else. The question a CRM is actually asked is "what has
-- happened with this record" — the call on Tuesday, the estimate emailed on
-- Wednesday, the site visit on Friday, and yes, the note. Those are one kind of
-- row with a type on it, not five tables, and a note is the degenerate case
-- where nothing happened except that somebody wrote something down.
--
-- So `notes` is folded in rather than joined to: every note becomes an activity
-- of type 'note', carrying its author and its original timestamps, and the
-- table goes. One place to look, one place to write, no screen that has to
-- merge two feeds and sort them.
--
-- Both tables here hang off the shared (entity_type, entity_id) link from the
-- party-model migration, which is what lets an activity describe a company, a
-- person, a deal or a ticket without a column per kind — and what lets a tag
-- land on any of them.

create type public.activity_type as enum ('note', 'call', 'email', 'meeting', 'sms', 'other');

-- Which way it went. Null for a note, which has no direction.
create type public.activity_direction as enum ('inbound', 'outbound');

-- The UI's ten tones, promoted to a database type so a tag's color is a value
-- the schema can hold. It mirrors `BadgeTone` in
-- src/lib/components/ui/badge/badge-tones.ts exactly — that file's whole point
-- is that nothing invents a one-off color, and a free-text hex column here
-- would be exactly that.
create type public.badge_tone as enum (
	'neutral',
	'success',
	'info',
	'warning',
	'error',
	'violet',
	'orange',
	'cyan',
	'rose',
	'indigo'
);

-- ---------------------------------------------------------------------------
-- activities — the interaction log
-- ---------------------------------------------------------------------------

create table public.activities (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Both null is the org-level note `notes.client_id is null` used to mean.
	entity_type public.crm_entity_type,
	entity_id uuid,
	type public.activity_type not null default 'note',
	direction public.activity_direction,
	subject text,
	body text,
	-- When it HAPPENED, which is not when it was typed: a call logged the next
	-- morning belongs on the timeline where the call was.
	occurred_at timestamptz not null default now(),
	duration_minutes integer,
	author_id uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint activities_entity_link_complete
		check ((entity_type is null) = (entity_id is null)),
	-- An activity with neither a subject nor a body is a row saying nothing.
	constraint activities_says_something
		check (coalesce(nullif(trim(subject), ''), nullif(trim(body), '')) is not null),
	constraint activities_duration_nonnegative
		check (duration_minutes is null or duration_minutes >= 0),
	-- A note is not a direction of travel.
	constraint activities_only_comms_have_direction
		check (direction is null or type in ('call', 'email', 'sms', 'meeting'))
);

comment on table public.activities is
	'One thing that happened against a CRM record — a call, an email, a meeting or a note. Replaces the `notes` table; a note is type = note.';
comment on column public.activities.occurred_at is
	'When the interaction happened, which is not when the row was created. The timeline sorts on this.';

create index activities_org_id_idx on public.activities (org_id);
-- The record timeline: everything against one entity, newest first.
create index activities_entity_occurred_at_idx
	on public.activities (org_id, entity_type, entity_id, occurred_at desc);
create index activities_author_id_idx on public.activities (author_id);

create trigger activities_set_updated_at
	before update on public.activities
	for each row execute procedure public.set_updated_at();

create trigger activities_check_entity
	before insert or update of org_id, entity_type, entity_id on public.activities
	for each row execute procedure public.check_crm_entity_link();

-- Carry every note across before the table goes. Types, authorship and both
-- timestamps survive; a note against a company keeps that link, an org-level
-- note keeps its absence.
insert into public.activities (
	id, org_id, entity_type, entity_id, type, subject, body,
	occurred_at, author_id, created_at, updated_at
)
select
	n.id,
	n.org_id,
	case when n.company_id is null then null else 'company'::public.crm_entity_type end,
	n.company_id,
	'note',
	null,
	n.body,
	n.created_at,
	n.author_id,
	n.created_at,
	n.updated_at
from public.notes n;

drop table public.notes;

-- ---------------------------------------------------------------------------
-- tags and taggings
-- ---------------------------------------------------------------------------

create table public.tags (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	tone public.badge_tone not null default 'neutral',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (id, org_id),
	constraint tags_name_not_blank check (length(trim(name)) > 0)
);

comment on table public.tags is
	'An org-defined label. `tone` is the shared badge vocabulary, so a tag and a status pill of the same tone are the same hue.';

create index tags_org_id_idx on public.tags (org_id);
-- One "VIP" per org, however it was capitalised the second time.
create unique index tags_org_id_name_idx on public.tags (org_id, lower(name));

create trigger tags_set_updated_at
	before update on public.tags
	for each row execute procedure public.set_updated_at();

-- Pure join rows: applied and removed, never edited. No updated_at, and no
-- update policy or grant below.
create table public.taggings (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	tag_id uuid not null,
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	foreign key (tag_id, org_id) references public.tags (id, org_id) on delete cascade,
	unique (tag_id, entity_type, entity_id)
);

comment on table public.taggings is
	'One tag applied to one CRM record. Join rows only — applied and removed, never edited.';

create index taggings_org_id_idx on public.taggings (org_id);
-- Both directions: the tags on a record, and the records under a tag.
create index taggings_entity_idx on public.taggings (org_id, entity_type, entity_id);
create index taggings_tag_id_idx on public.taggings (tag_id);

create trigger taggings_check_entity
	before insert or update of org_id, entity_type, entity_id on public.taggings
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- Deleting a record takes its log and its labels with it
-- ---------------------------------------------------------------------------

-- The one place that answers "what happens when a CRM record is deleted",
-- extended rather than duplicated. The split it encodes:
--
--   proposals   detach — a sent proposal is a commercial record of its own
--   addresses   delete — part of the party, and an orphaned home address is a
--                        privacy problem, not an archive
--   activities  delete — an activity is ABOUT the record; kept without it you
--                        get a pile of contextless notes naming a person you
--                        were asked to forget
--   taggings    delete — a label on nothing
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

	delete from public.addresses
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.activities
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.taggings
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	return old;
end;
$$;

-- Every parent kind the link can name now installs it. companies, contacts,
-- deals and products already carry the trigger from earlier migrations; these
-- are the rest, so no record can be deleted and leave its log behind.
create trigger proposals_crm_entity_deleted
	after delete on public.proposals
	for each row execute procedure public.on_crm_entity_deleted('proposal');

create trigger tasks_crm_entity_deleted
	after delete on public.tasks
	for each row execute procedure public.on_crm_entity_deleted('task');

create trigger support_tickets_crm_entity_deleted
	after delete on public.support_tickets
	for each row execute procedure public.on_crm_entity_deleted('ticket');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Activities inherit the `notes` rules exactly: any member logs one, the
-- author or an owner/admin edits or removes it. Tags are org configuration
-- (owner/admin shapes the vocabulary) but applying one is everyday work, so
-- taggings are member-writable.

alter table public.activities enable row level security;
alter table public.tags enable row level security;
alter table public.taggings enable row level security;

create policy "Members can view activities"
	on public.activities for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can log activities as themselves"
	on public.activities for insert to authenticated
	with check (private.org_role(org_id) is not null and author_id = (select auth.uid()));

create policy "Authors and managers can update activities"
	on public.activities for update to authenticated
	using (
		private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	)
	with check (
		private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	);

create policy "Authors and managers can delete activities"
	on public.activities for delete to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

create policy "Members can view tags"
	on public.tags for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create tags"
	on public.tags for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update tags"
	on public.tags for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete tags"
	on public.tags for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view taggings"
	on public.taggings for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can apply tags as themselves"
	on public.taggings for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can remove tags"
	on public.taggings for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

-- The entity link is insert-only, like an address's: an activity describes the
-- record it was logged against, and re-pointing it rewrites history.
revoke insert, update on table public.activities from authenticated;
grant insert (org_id, entity_type, entity_id, type, direction, subject, body, occurred_at,
		duration_minutes, author_id),
	update (type, direction, subject, body, occurred_at, duration_minutes)
	on table public.activities to authenticated;

revoke insert, update on table public.tags from authenticated;
grant insert (org_id, name, tone),
	update (name, tone)
	on table public.tags to authenticated;

-- Nothing on a tagging is editable, so there is no update grant at all.
revoke insert, update on table public.taggings from authenticated;
grant insert (org_id, tag_id, entity_type, entity_id, created_by)
	on table public.taggings to authenticated;
