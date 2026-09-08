-- notes — writing that stays open, and the sticky-note surface built on it.
--
-- The activities migration folded the old `notes` table into `activities` and
-- said why: a comment on a client is not its own kind of row, it is the
-- degenerate activity where nothing happened except that somebody wrote
-- something down. That reasoning still holds, and this table is not a walk
-- back from it. An activity is a MOMENT — it has an `occurred_at`, a
-- direction, a duration, and once the call is logged the row stops changing.
-- A note is a DOCUMENT: opened, edited for weeks, recolored, archived, and
-- read back on any screen. Storing a document as a timeline entry means every
-- edit silently rewrites history, and the record timeline fills up with
-- scratch nobody logged.
--
-- So: one general table, deliberately not CRM-specific. A note may point at
-- some record through the shared (entity_type, entity_id) link — the estimate
-- you are drafting for a company, the reminder about a deal — or at nothing
-- at all, which is the common case and why the pair is nullable. Nothing
-- points AT a note: it is not a `crm_entity_type`, has no record page and no
-- list row, because a note is read where it is written.
--
-- Tenancy is the canonical shape: org_id with the cascade, RLS on, working
-- data member-writable, authored content editable by its author or an
-- owner/admin, column grants keeping org_id and authorship out of the
-- browser's reach. A note is org-scoped like everything else here (`profiles`
-- is the one per-user exception) — the point of writing something down next
-- to a company is that the person covering for you can read it.

create table public.notes (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- What the note is about, when it is about anything. Both null is a note
	-- that stands on its own — a scratchpad, a checklist, a phone number.
	entity_type public.crm_entity_type,
	entity_id uuid,
	-- Optional: an untitled note is named by its first line (`noteLabel()` in
	-- src/lib/notes.ts), the way a sticky note is named by what it says.
	title text,
	-- Never null, so a note being written into is a row like any other and the
	-- editor has nothing to coalesce. Blank is a legitimate state: a note is
	-- created empty and typed into, which is exactly why there is no
	-- `activities_says_something` equivalent here.
	body text not null default '',
	-- The paper color, from the ten tones the app already owns (the
	-- activities migration promoted them from BadgeTone). Amber is the
	-- default because a sticky note is yellow.
	color public.badge_tone not null default 'warning',
	-- Out of the way without being gone. Nullable rather than a boolean so the
	-- row records WHEN it left the desk.
	archived_at timestamptz,
	author_id uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint notes_entity_link_complete
		check ((entity_type is null) = (entity_id is null)),
	constraint notes_title_length check (title is null or length(title) <= 200),
	-- A note is not a document store. The editor stops typing at the same
	-- number (src/lib/notes.ts), so this only ever fires on a hand-made post.
	constraint notes_body_length check (length(body) <= 20000)
);

comment on table public.notes is
	'A piece of writing that stays open — a sticky note. Optionally about one CRM record through the shared entity link. Not an activity: an activity is a moment that happened, a note is a document that keeps changing.';
comment on column public.notes.archived_at is
	'When the note left the active set. Null is an open note; archiving never deletes.';

create index notes_org_id_idx on public.notes (org_id);
-- The rail: every open note in the org, newest first.
create index notes_org_created_at_idx on public.notes (org_id, created_at desc);
-- One record's notes, the way the record page reads them.
create index notes_entity_idx on public.notes (org_id, entity_type, entity_id);
create index notes_author_id_idx on public.notes (author_id);

create trigger notes_set_updated_at
	before update on public.notes
	for each row execute procedure public.set_updated_at();

create trigger notes_check_entity
	before insert or update of org_id, entity_type, entity_id on public.notes
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- What happens when the record a note points at is deleted
-- ---------------------------------------------------------------------------

-- The one place that answers "what happens when a CRM record goes" grows a
-- branch rather than the app growing a second cleanup path (the party-model
-- migration's rule). Notes DETACH, like proposals and unlike activities: an
-- activity is a fact about the record and goes with it, but a note is
-- something a person wrote, and deleting a company should not shred the
-- writing that happened to be pinned to it. The note stays on the rail, about
-- nothing in particular now.
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

alter table public.notes enable row level security;

-- Authored content, the activities rule exactly: everyone in the org reads
-- it, anyone writes their own, the author or a manager edits and removes it.
create policy "Members can view notes"
	on public.notes for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can write notes as themselves"
	on public.notes for insert to authenticated
	with check (private.org_role(org_id) is not null and author_id = (select auth.uid()));

create policy "Authors and managers can update notes"
	on public.notes for update to authenticated
	using (
		private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	)
	with check (
		private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	);

create policy "Authors and managers can delete notes"
	on public.notes for delete to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a client may write, these decide which COLUMNS.
-- org_id and author_id are insert-only, so a note can never be moved between
-- orgs or reassigned to someone else.
revoke insert, update on table public.notes from authenticated;
grant insert (org_id, entity_type, entity_id, title, body, color, author_id)
	on table public.notes to authenticated;
-- The entity link IS updatable here, unlike an activity's: you jot something
-- down first and attach it to the company it turned out to be about later.
-- That is the note working as intended, not history being rewritten.
grant update (entity_type, entity_id, title, body, color, archived_at)
	on table public.notes to authenticated;

-- ---------------------------------------------------------------------------
-- The registry rows: /notes exists
-- ---------------------------------------------------------------------------
-- The migration that adds a route registers it (the features migration's
-- closing checklist).

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('notes', 'Notes', 'note',
		'Everything you jotted down, docked to the edge of the screen.',
		'/notes', 'sticky-note', 'platform', 35)
on conflict (id) do nothing;

-- No title of its own: the page is named by its feature.
insert into public.pages (id, feature_id, path, title) values
	('notes', 'notes', '/notes', null)
on conflict (id) do nothing;

-- Every vertical writes things down, and none of them calls it anything else,
-- so the rows are derived (an industry added later cannot silently miss the
-- feature) and none carries its own name.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'notes'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan, including free: a product whose free tier cannot hold a note is
-- not holding much.
insert into public.tier_features (tier_id, feature_id)
select t.id, 'notes'
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
	on f.industry_id = ladder.industry_id and f.feature_id = 'notes'
on conflict (role_id, feature_id) do nothing;

-- The specialists, derived from what each role can already do rather than
-- listed: taking a note is not a specialty, it is what everyone with a job to
-- do needs. A role that may change anything at all may write notes; a role
-- that may only look at things may only read them — which is what keeps a
-- Viewer a viewer. The ladder above ran first, so a Director keeps `delete`.
insert into public.role_permissions (role_id, feature_id, level)
select
	rp.role_id,
	'notes',
	case when bool_or(rp.level in ('manage', 'delete')) then 'manage' else 'read' end
		::public.permission_level
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.industry_features f
	on f.industry_id = r.industry_id and f.feature_id = 'notes'
where rp.feature_id <> 'notes'
group by rp.role_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Tags on a note
-- ---------------------------------------------------------------------------
-- Not yet, and deliberately not a second mechanism when it comes. Tagging
-- goes through `taggings` + the shared link, so tagging a note means adding
-- 'note' to `crm_entity_type` and a branch to `private.crm_entity_exists()`
-- and `public.on_crm_entity_deleted()` — in TWO migrations, because Postgres
-- refuses to use an enum value added in the same transaction (the party-model
-- migration says so). Until then a note is found by its words, not its tags.
