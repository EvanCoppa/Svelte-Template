-- The relationship graph: one table for every record-to-record link, laid
-- over the relational CRM rather than folded into it.
--
-- Until now, relating two CRM records meant either a column (a contact's
-- `company_id`, a deal's `contact_id`) or, for anything the columns did not
-- foresee, a new junction table — and a junction table per pair of kinds is
-- a schema migration every time the product learns that a person can own a
-- truck, a truck can be leased from a supplier, or a building can be managed
-- by a contact. This migration ends that: a relationship is a row naming two
-- records through the shared entity link, typed by a row in a definitions
-- table the org can extend.
--
--   relationship_types  what a relationship can be. A pair of labels — the
--                       forward one read from the `from` side ("owns") and the
--                       inverse read from the `to` side ("owned by") — and,
--                       optionally, which kinds of record may stand on each
--                       side. System types (org_id null) ship here and belong
--                       to every org; an org's own types belong to it alone.
--   relationships       one row per relationship. `from` and `to` are the
--                       polymorphic (entity_type, entity_id) pair every other
--                       attach table uses, so a company, a contact, an asset,
--                       an employee (the 'member' kind) or a kind added next
--                       year all take part with no change here; a type says
--                       what the row means; the dates say when it held.
--
-- What this is NOT for: the columns that make a record what it is. A
-- contact's `company_id` is still the primary place they work — it drives
-- the contacts list, the views and the cascade when the company goes — and a
-- deal's parties stay on the deal. A relationship is the graph beside those
-- columns: the second employer, the referral, the ownership, the assignment.
--
-- One row is the relationship, whichever side you read it from. The
-- inverse is a LABEL, never a second row: a page showing the `to` record
-- draws the same row with `inverse_label`, and the app's relationships
-- module (src/lib/server/crm/relationships.ts) does that once for every
-- screen.
--
-- Tenancy: org_id on both tables, the canonical cascade, RLS on. A
-- relationship's endpoints are checked to exist IN THE RELATIONSHIP'S ORG
-- by the same SECURITY DEFINER lookup every attach table uses, so
-- from.org = to.org = relationship.org holds by construction and no policy
-- has to traverse anything.

-- ---------------------------------------------------------------------------
-- relationship_types — what a relationship can be
-- ---------------------------------------------------------------------------

create table public.relationship_types (
	id uuid not null primary key default gen_random_uuid(),
	-- Null: a system type, available to every org and written only by
	-- migration. Set: the org's own, kept by its owners/admins.
	org_id uuid references public.organizations (id) on delete cascade,
	-- A stable handle for app code and seeds ('works_at', 'owns'). Unique
	-- among the system types, and within an org for its own.
	key text not null,
	-- Read from the `from` side: "<from> works at <to>".
	forward_label text not null,
	-- Read from the `to` side: "<to> employs <from>". The same word twice
	-- for a symmetric type (spouse of).
	inverse_label text not null,
	-- Which kind may stand on each side. Null means any kind, so a type can
	-- be as broad as "related to" or as narrow as contact → company. When
	-- set it is a hard rule (the trigger below), because the labels only
	-- read correctly for the kinds they were written for.
	source_type public.crm_entity_type,
	target_type public.crm_entity_type,
	is_system boolean generated always as (org_id is null) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint relationship_types_key_is_slug check (key ~ '^[a-z][a-z0-9_]*$'),
	constraint relationship_types_forward_label_not_blank check (length(trim(forward_label)) > 0),
	constraint relationship_types_inverse_label_not_blank check (length(trim(inverse_label)) > 0)
);

comment on table public.relationship_types is
	'What a relationship can be: a forward and an inverse label, and optionally which kinds of record stand on each side. org_id null is a system type every org has; set, an org''s own.';
comment on column public.relationship_types.source_type is
	'The kind a `from` record must be, or null for any. Enforced by trigger, because the labels only read correctly for the kinds they were written for.';

-- A system key is unique outright; an org's keys are unique within the org.
create unique index relationship_types_system_key_idx
	on public.relationship_types (key)
	where org_id is null;
create unique index relationship_types_org_id_key_idx
	on public.relationship_types (org_id, key)
	where org_id is not null;
create index relationship_types_org_id_idx on public.relationship_types (org_id);

create trigger relationship_types_set_updated_at
	before update on public.relationship_types
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- relationships — the graph
-- ---------------------------------------------------------------------------

create table public.relationships (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Restrict, not cascade: a type with relationships behind it cannot be
	-- deleted out from under them. Retire the rows first, deliberately.
	relationship_type_id uuid not null references public.relationship_types (id) on delete restrict,
	from_type public.crm_entity_type not null,
	from_id uuid not null,
	to_type public.crm_entity_type not null,
	to_id uuid not null,
	-- When it held. Both optional: most relationships are simply current.
	-- An ended one is history, kept on purpose — the previous employer, the
	-- asset's last holder.
	started_on date,
	ended_on date,
	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint relationships_ended_after_started
		check (started_on is null or ended_on is null or ended_on >= started_on)
	-- Deliberately no rule against a record relating to itself: nothing
	-- shipped here makes sense of one, but a type added later might, and a
	-- type that must not allow it can say so in its own validation.
);

comment on table public.relationships is
	'One record-to-record relationship, of a relationship_types kind, between two CRM records of any kind in the same org. One row whichever side you read it from; the inverse label is how the other side shows it.';
comment on column public.relationships.ended_on is
	'Set when the relationship stopped holding. At most one OPEN relationship of a type exists per pair; ended ones may repeat, so a history of employment periods fits.';

-- At most one open relationship of a type between the same two records, in
-- the same direction. Ended ones are history and may repeat — Person A
-- worked at Company B twice — so the rule is partial rather than absolute.
create unique index relationships_one_open_per_pair_idx
	on public.relationships (org_id, relationship_type_id, from_type, from_id, to_type, to_id)
	where ended_on is null;

create index relationships_org_id_idx on public.relationships (org_id);
-- A record's relationships, from either side.
create index relationships_from_idx on public.relationships (org_id, from_type, from_id);
create index relationships_to_idx on public.relationships (org_id, to_type, to_id);
create index relationships_relationship_type_id_idx on public.relationships (relationship_type_id);

create trigger relationships_set_updated_at
	before update on public.relationships
	for each row execute procedure public.set_updated_at();

-- The integrity a foreign key would give, for the two links Postgres
-- cannot express — plus the two rules the type imposes:
--
--   1. both endpoints exist in the relationship's own org, so a relationship
--      can never cross a tenant boundary (the same lookup every attach table
--      uses; a forged org_id finds nothing and is refused)
--   2. the type is a system type or belongs to this org
--   3. the endpoints are the kinds the type was written for, where it says
--
-- Raising with the foreign-key errcode keeps app-side error mapping uniform
-- with `check_crm_entity_link`.
create function public.check_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	kind record;
begin
	if not private.crm_entity_exists(new.org_id, new.from_type, new.from_id) then
		raise exception 'crm record % % does not exist in organization %',
			new.from_type, new.from_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;

	if not private.crm_entity_exists(new.org_id, new.to_type, new.to_id) then
		raise exception 'crm record % % does not exist in organization %',
			new.to_type, new.to_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;

	select org_id, source_type, target_type
	into kind
	from public.relationship_types
	where id = new.relationship_type_id;

	if kind.org_id is not null and kind.org_id <> new.org_id then
		raise exception 'relationship type % does not belong to organization %',
			new.relationship_type_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;

	if kind.source_type is not null and kind.source_type <> new.from_type then
		raise exception 'relationship type % expects a % on the from side, not a %',
			new.relationship_type_id, kind.source_type, new.from_type
			using errcode = 'check_violation';
	end if;

	if kind.target_type is not null and kind.target_type <> new.to_type then
		raise exception 'relationship type % expects a % on the to side, not a %',
			new.relationship_type_id, kind.target_type, new.to_type
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

create trigger relationships_check
	before insert or update of org_id, relationship_type_id, from_type, from_id, to_type, to_id
	on public.relationships
	for each row execute procedure public.check_relationship();

-- A type's scope cannot be narrowed under rows that would no longer fit,
-- and a type cannot change hands: the same rule a custom field definition
-- follows for its entity_type, raised with the error that says why.
create function public.check_relationship_type_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.org_id is distinct from old.org_id and exists (
		select 1 from public.relationships where relationship_type_id = new.id
	) then
		raise exception 'relationship type % has relationships; it cannot change organization', new.key
			using errcode = 'check_violation';
	end if;

	if new.source_type is not null and exists (
		select 1 from public.relationships
		where relationship_type_id = new.id and from_type <> new.source_type
	) then
		raise exception 'relationship type % has relationships whose from side is not a %',
			new.key, new.source_type
			using errcode = 'check_violation';
	end if;

	if new.target_type is not null and exists (
		select 1 from public.relationships
		where relationship_type_id = new.id and to_type <> new.target_type
	) then
		raise exception 'relationship type % has relationships whose to side is not a %',
			new.key, new.target_type
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

create trigger relationship_types_check_scope
	before update of org_id, source_type, target_type on public.relationship_types
	for each row execute procedure public.check_relationship_type_scope();

-- ---------------------------------------------------------------------------
-- What happens when a record on either side is deleted
-- ---------------------------------------------------------------------------

-- A relationship is not a record of its own; it goes with either end. The
-- one cleanup function grows the branch — and, because a member is an
-- entity keyed by user_id rather than id, its body moves into a helper the
-- membership table's own trigger can call with the right id. Every parent
-- table keeps the trigger it has; `on_crm_entity_deleted` is now the
-- one-line adapter from `old.id` to that helper.
create function private.on_crm_entity_gone(org uuid, deleted_kind public.crm_entity_type, entity uuid)
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

	delete from public.addresses
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.activities
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.taggings
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.custom_field_values
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.relationships
	where org_id = org
		and ((from_type = deleted_kind and from_id = entity)
			or (to_type = deleted_kind and to_id = entity));
end;
$$;

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

-- Leaving the org ends every relationship that named the member: the
-- laptop is no longer assigned to someone who does not work here.
create function public.on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform private.on_crm_entity_gone(old.org_id, 'member', old.user_id);
	return old;
end;
$$;

create trigger organization_members_crm_entity_deleted
	after delete on public.organization_members
	for each row execute procedure public.on_member_removed();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.relationship_types enable row level security;
alter table public.relationships enable row level security;

-- relationship_types -------------------------------------------------------
-- The system rows are reference data every signed-in user reads (like
-- tiers); an org's own are an org-defined vocabulary, kept by owners/admins
-- like pipelines and custom field definitions. Nothing lets a client write a
-- system row: the insert check requires an org, and the update/delete
-- policies never match an org_id of null.

create policy "Members can view relationship types"
	on public.relationship_types for select to authenticated
	using (org_id is null or private.org_role(org_id) is not null);

create policy "Owners and admins can create relationship types"
	on public.relationship_types for insert to authenticated
	with check (org_id is not null and private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update relationship types"
	on public.relationship_types for update to authenticated
	using (org_id is not null and private.org_role(org_id) in ('owner', 'admin'))
	with check (org_id is not null and private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete relationship types"
	on public.relationship_types for delete to authenticated
	using (org_id is not null and private.org_role(org_id) in ('owner', 'admin'));

-- relationships ------------------------------------------------------------
-- A link between two records the member can already see, made and unmade in
-- the course of the work — a tagging, not a record: member-writable
-- including removal, which is what lets someone undo the link they just
-- drew. Both endpoints are in this org by the trigger above, so the
-- org_id check IS the check on both ends.

create policy "Members can view relationships"
	on public.relationships for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create relationships as themselves"
	on public.relationships for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update relationships"
	on public.relationships for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can remove relationships"
	on public.relationships for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

-- `is_system` is generated; org_id is set once.
revoke insert, update on table public.relationship_types from authenticated;
grant insert (org_id, key, forward_label, inverse_label, source_type, target_type),
	update (key, forward_label, inverse_label, source_type, target_type)
	on table public.relationship_types to authenticated;

-- The endpoints and the type are set when the row is written: re-pointing a
-- relationship is a delete and a create, the addresses rule, so the unique
-- index and the trigger only ever see a row as a whole. The dates and the
-- note may be corrected afterwards.
revoke insert, update on table public.relationships from authenticated;
grant insert (org_id, relationship_type_id, from_type, from_id, to_type, to_id, started_on,
		ended_on, notes, created_by),
	update (started_on, ended_on, notes)
	on table public.relationships to authenticated;

-- ---------------------------------------------------------------------------
-- The system types
-- ---------------------------------------------------------------------------
-- Fixed ids (f0…) so seeds and tests can name them; keys are what app code
-- uses. Scoped where the labels only read one way, open where they read for
-- anything: "owns" is written for an asset on the to side and anyone on the
-- from side, because a person, a company and the org itself (a member, on
-- its behalf) all own things.

insert into public.relationship_types (id, key, forward_label, inverse_label, source_type, target_type) values
	-- People and companies
	('f0000000-0000-0000-0000-000000000001', 'works_at', 'works at', 'employs', 'contact', 'company'),
	('f0000000-0000-0000-0000-000000000002', 'reports_to', 'reports to', 'manages', 'contact', 'contact'),
	('f0000000-0000-0000-0000-000000000003', 'spouse_of', 'spouse of', 'spouse of', 'contact', 'contact'),
	('f0000000-0000-0000-0000-000000000004', 'referred_by', 'referred by', 'referred', null, null),
	('f0000000-0000-0000-0000-000000000005', 'parent_of', 'parent company of', 'subsidiary of', 'company', 'company'),
	('f0000000-0000-0000-0000-000000000006', 'customer_of', 'customer of', 'supplies', 'company', 'company'),
	-- Assets
	('f0000000-0000-0000-0000-000000000011', 'owns', 'owns', 'owned by', null, 'asset'),
	('f0000000-0000-0000-0000-000000000012', 'assigned_to', 'assigned to', 'holds', 'asset', null),
	('f0000000-0000-0000-0000-000000000013', 'responsible_for', 'responsible for', 'responsibility of', 'member', null),
	('f0000000-0000-0000-0000-000000000014', 'purchased_from', 'purchased from', 'sold', 'asset', 'company'),
	('f0000000-0000-0000-0000-000000000015', 'leased_from', 'leased from', 'leases out', 'asset', 'company'),
	('f0000000-0000-0000-0000-000000000016', 'part_of', 'part of', 'has part', 'asset', 'asset'),
	('f0000000-0000-0000-0000-000000000017', 'replaced_by', 'replaced by', 'replaces', 'asset', 'asset'),
	('f0000000-0000-0000-0000-000000000018', 'installed_at', 'installed at', 'site of', 'asset', null),
	-- Anything
	('f0000000-0000-0000-0000-000000000021', 'managed_by', 'managed by', 'manages', null, null),
	('f0000000-0000-0000-0000-000000000022', 'related_to', 'related to', 'related to', null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- How to relate a new kind of record
-- ---------------------------------------------------------------------------
-- Nothing here changes. A kind that can stand in a relationship is a
-- `crm_entity_type` value with a `private.crm_entity_exists()` branch and a
-- delete trigger calling `on_crm_entity_deleted('<kind>')` — the party-model
-- migration's checklist — and every relationship type with a null side
-- accepts it at once. A custom object shipped later is one enum value
-- ('custom_record'), one table carrying its object definition, and that
-- same branch: no junction table per pair of kinds, ever again.
--
-- To add a system relationship type: one insert above, in a migration.
-- To add an org's own: an insert with org_id set, through the owner/admin
-- policy — no migration.
