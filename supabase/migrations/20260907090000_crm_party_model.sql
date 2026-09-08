-- The party model: who you deal with, split the way every CRM splits it.
--
-- crm_core shipped `clients` (an account) with `client_contacts` hanging off
-- it, which forces a choice no vertical wants to make: a dental patient and a
-- roofing homeowner are people with no company above them, while a commercial
-- roofing job and a supply contract belong to a business. Modelling those as
-- two unrelated tables means every screen, search and proposal link has to ask
-- "which kind is this" forever.
--
-- So the split is by WHAT the row is, not by how you happen to sell to it:
--
--   companies — an organization you interact with. `relationship` says which
--               side of the business it is (a customer, a supplier, a
--               referral partner), so vendors live here too instead of
--               growing a second table that is a company in all but name.
--   contacts  — a person. `company_id` is NULLABLE: a person who IS the
--               customer (the patient, the homeowner) simply has none, and a
--               person at a business points at it. One table, so a search, a
--               proposal recipient and an activity subject each have exactly
--               one kind of person to resolve.
--
-- Both keep the `party_status` lifecycle (lead → prospect → active →
-- inactive), because "is this a live relationship" is a question you ask of a
-- one-person customer just as often as of a company.
--
-- The other half of this migration is the link the whole CRM shares. The
-- proposals migration already had to invent one — a polymorphic
-- (entity_type, entity_id) pair, a SECURITY DEFINER existence check standing
-- in for the foreign key Postgres cannot express, and a detach trigger on
-- every parent — because a proposal attaches to any CRM record. Addresses,
-- activities, tags and custom values all need precisely that. Rather than
-- copy the machinery four more times, this migration PROMOTES it: one
-- `crm_entity_type` enum, one `private.crm_entity_exists()`, one
-- `public.on_crm_entity_deleted()` cleanup trigger, and proposals moves onto
-- them. Every later table that points at "some CRM record" reuses these three
-- and adds a branch, never a second mechanism.
--
-- Tenancy is unchanged: org_id with the canonical cascade, RLS on, working
-- data member-writable, deletes owner/admin, column grants keeping org_id and
-- authorship out of the browser's reach.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- The lifecycle both parties share. Renamed rather than replaced so existing
-- columns, policies and the generated types follow it.
alter type public.client_status rename to party_status;

-- Which side of the business a company sits on. Deliberately NOT a status:
-- an inactive supplier is still a supplier, and a company can be a customer
-- for years before it also becomes a partner.
create type public.company_relationship as enum ('customer', 'supplier', 'partner', 'other');

-- The kinds a polymorphic CRM link may point at. Declared complete here, up
-- front, even though `products` arrives two migrations later: adding an enum
-- value and using it in the same transaction is what Postgres refuses, so the
-- values ship once and `private.crm_entity_exists` grows a branch per table as
-- the tables appear.
create type public.crm_entity_type as enum (
	'company',
	'contact',
	'deal',
	'product',
	'proposal',
	'proposal_option',
	'task',
	'ticket'
);

-- ---------------------------------------------------------------------------
-- clients → companies
-- ---------------------------------------------------------------------------

alter table public.clients rename to companies;

-- A rename leaves every constraint, index, trigger and policy carrying the old
-- name. Renaming them too is not cosmetic: these names are what a `\d`, a
-- constraint violation and an RLS debugging session show you.
alter table public.companies rename constraint clients_pkey to companies_pkey;
alter table public.companies rename constraint clients_id_org_id_key to companies_id_org_id_key;
alter table public.companies rename constraint clients_org_id_fkey to companies_org_id_fkey;
alter table public.companies rename constraint clients_created_by_fkey to companies_created_by_fkey;
alter index public.clients_org_id_idx rename to companies_org_id_idx;
alter trigger clients_set_updated_at on public.companies rename to companies_set_updated_at;
alter policy "Members can view clients" on public.companies rename to "Members can view companies";
alter policy "Members can create clients as themselves" on public.companies
	rename to "Members can create companies as themselves";
alter policy "Members can update clients" on public.companies rename to "Members can update companies";
alter policy "Owners and admins can delete clients" on public.companies
	rename to "Owners and admins can delete companies";

-- `company` was the account's own company name, which the row now IS. It
-- carried no information the `name` column did not.
alter table public.companies drop column company;

alter table public.companies
	add column relationship public.company_relationship not null default 'customer';

comment on table public.companies is
	'An organization the org interacts with — customer, supplier or partner. Tenant-scoped; `relationship` says which, `status` says how live it is.';
comment on column public.companies.relationship is
	'Which side of the business this company sits on. A supplier is a company too — it does not get its own table.';

-- ---------------------------------------------------------------------------
-- client_contacts → contacts
-- ---------------------------------------------------------------------------

alter table public.client_contacts rename to contacts;
alter table public.contacts rename column client_id to company_id;

alter table public.contacts rename constraint client_contacts_pkey to contacts_pkey;
alter table public.contacts rename constraint client_contacts_org_id_fkey to contacts_org_id_fkey;
alter index public.client_contacts_org_id_idx rename to contacts_org_id_idx;
alter index public.client_contacts_client_id_idx rename to contacts_company_id_idx;
alter trigger client_contacts_set_updated_at on public.contacts rename to contacts_set_updated_at;

-- The point of the reshape: a person can stand alone. The parent link becomes
-- optional, and losing the company detaches the person instead of deleting
-- them — you still know the human being after you drop the account.
alter table public.contacts alter column company_id drop not null;
alter table public.contacts drop constraint client_contacts_client_id_org_id_fkey;
alter table public.contacts
	add constraint contacts_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id);

-- A standalone contact is a customer in their own right, so it needs the same
-- lifecycle a company has. `created_by` matches every other working table.
alter table public.contacts
	add column status public.party_status not null default 'lead',
	add column created_by uuid references auth.users (id) on delete set null default auth.uid(),
	-- Composite target so children (a portal login, a deal, an address) can be
	-- pinned to a contact in the same org, the clients trick from crm_core.
	add constraint contacts_id_org_id_key unique (id, org_id);

comment on table public.contacts is
	'A person. `company_id` null means the person is the customer themselves (a patient, a homeowner); set means they work at that company.';
comment on column public.contacts.company_id is
	'The company this person belongs to, or null when they stand alone. Deleting the company detaches rather than deletes.';

-- ---------------------------------------------------------------------------
-- Every record that pointed at a client now points at a company AND a person
-- ---------------------------------------------------------------------------

-- A deal, a task and a ticket each involve at most one business and at most
-- one human, and which of the two is the "real" parent depends entirely on the
-- vertical — a commercial roof is a company's, a filling is a patient's. Two
-- nullable columns say that without a polymorphic link, and both being null is
-- a legitimate state: the general opportunity nobody is attached to yet.

alter table public.deals rename column client_id to company_id;
alter index public.deals_client_id_idx rename to deals_company_id_idx;
alter table public.deals alter column company_id drop not null;
alter table public.deals drop constraint deals_client_id_org_id_fkey;
alter table public.deals
	add column contact_id uuid,
	add constraint deals_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id),
	-- Losing either party detaches the deal; a pipeline record outlives the
	-- account it started with, exactly like a ticket does in crm_core.
	add constraint deals_contact_id_org_id_fkey
		foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id);
create index deals_contact_id_idx on public.deals (contact_id);

alter table public.tasks rename column client_id to company_id;
alter index public.tasks_client_id_idx rename to tasks_company_id_idx;
alter table public.tasks drop constraint tasks_client_id_org_id_fkey;
alter table public.tasks
	add column contact_id uuid,
	add constraint tasks_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id),
	add constraint tasks_contact_id_org_id_fkey
		foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id);
create index tasks_contact_id_idx on public.tasks (contact_id);

alter table public.support_tickets rename column client_id to company_id;
alter index public.support_tickets_client_id_idx rename to support_tickets_company_id_idx;
alter table public.support_tickets drop constraint support_tickets_client_id_org_id_fkey;
alter table public.support_tickets
	add column contact_id uuid,
	add constraint support_tickets_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id),
	add constraint support_tickets_contact_id_org_id_fkey
		foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id);
create index support_tickets_contact_id_idx on public.support_tickets (contact_id);

-- notes keeps its shape here and is folded into `activities` two migrations
-- later; renaming the column now keeps the schema readable in between.
alter table public.notes rename column client_id to company_id;
alter index public.notes_client_id_idx rename to notes_company_id_idx;
alter table public.notes drop constraint notes_client_id_org_id_fkey;
alter table public.notes
	add constraint notes_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id);

-- ---------------------------------------------------------------------------
-- The shared polymorphic link, promoted out of the proposals migration
-- ---------------------------------------------------------------------------

-- The foreign key a polymorphic link cannot have: does this record exist in
-- this org? Same contract as the `private.proposal_entity_exists` it replaces —
-- SECURITY DEFINER because `private` is reachable only from stored expressions,
-- empty search_path forcing qualified names — but keyed by the shared enum, so
-- every table that points at "some CRM record" asks the same question. The
-- `else false` matters: a kind whose table does not exist yet (product, until
-- the catalog migration adds its branch) must read as absent, never as null,
-- or the callers' `not exists` check would silently pass.
create function private.crm_entity_exists(org uuid, kind public.crm_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'company' then exists (select 1 from public.companies where id = entity and org_id = org)
		when 'contact' then exists (select 1 from public.contacts where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

-- The generic BEFORE trigger every table with a polymorphic link installs.
-- The kind it validates is the row's own `entity_type`, so one function covers
-- all of them; raising with the foreign-key errcode keeps app-side error
-- mapping uniform, exactly as check_proposal_entity did.
create function public.check_crm_entity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.entity_type is not null and new.entity_id is not null
		and not private.crm_entity_exists(new.org_id, new.entity_type, new.entity_id)
	then
		raise exception 'crm record % % does not exist in organization %',
			new.entity_type, new.entity_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;
	return new;
end;
$$;

-- The `on delete` half of that missing foreign key, in one place. Each parent
-- table installs it with its own kind as tg_argv[0], and the body decides per
-- dependent table whether the link detaches or the row goes:
--
--   proposals  detach — an accepted proposal is a commercial record that
--                       outlives the account it was written for
--   addresses  delete — an address is part of the party, not a record of its
--                       own; keeping it orphaned leaks a home address
--
-- Later migrations extend this body rather than adding a second trigger per
-- parent, so "what happens when a company is deleted" stays answerable in one
-- read.
create function public.on_crm_entity_deleted()
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

	return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- proposals moves onto the shared link
-- ---------------------------------------------------------------------------

-- 'client' is the one value whose meaning changed with the table behind it.
alter type public.proposal_entity_type rename value 'client' to 'company';

-- Both triggers must go before the column can change type: they depend on the
-- old enum through their functions.
drop trigger clients_detach_proposals on public.companies;
drop trigger client_contacts_detach_proposals on public.contacts;
drop trigger deals_detach_proposals on public.deals;
drop trigger proposals_check_entity on public.proposals;
drop function public.detach_proposals_from_entity();
drop function public.check_proposal_entity();

alter table public.proposals
	alter column entity_type type public.crm_entity_type
	using entity_type::text::public.crm_entity_type;

drop function private.proposal_entity_exists(uuid, public.proposal_entity_type, uuid);
drop type public.proposal_entity_type;

-- The enum is now wider than a proposal's parent should be: a proposal hangs
-- off a party or an opportunity, never off another proposal or a product. The
-- check says so explicitly instead of leaving it to the app.
alter table public.proposals
	add constraint proposals_entity_is_crm_record
		check (entity_type is null or entity_type in ('company', 'contact', 'deal'));

create trigger proposals_check_entity
	before insert or update of org_id, entity_type, entity_id on public.proposals
	for each row execute procedure public.check_crm_entity_link();

create trigger companies_crm_entity_deleted
	after delete on public.companies
	for each row execute procedure public.on_crm_entity_deleted('company');

create trigger contacts_crm_entity_deleted
	after delete on public.contacts
	for each row execute procedure public.on_crm_entity_deleted('contact');

create trigger deals_crm_entity_deleted
	after delete on public.deals
	for each row execute procedure public.on_crm_entity_deleted('deal');

-- ---------------------------------------------------------------------------
-- addresses — where a party actually is
-- ---------------------------------------------------------------------------

-- A party has more than one: a roofing customer's mailing address is not the
-- roof, and a company bills somewhere its goods never ship. So this is a table,
-- not five columns on `companies`, and it hangs off the shared link so a
-- company and a standalone person are addressed the same way.
--
-- `kind` is what the address is FOR; `is_primary` is which one to show on the
-- record header. They are separate because a customer can have three service
-- addresses (three job sites) and still exactly one you put at the top.
create type public.address_kind as enum ('primary', 'billing', 'shipping', 'service', 'other');

create table public.addresses (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	kind public.address_kind not null default 'primary',
	-- A label the org writes ("North warehouse", "Unit 4 roof"), for the
	-- addresses where the kind alone does not tell them apart.
	label text,
	line1 text not null,
	line2 text,
	city text,
	-- State, province or county — one column, because no two countries agree
	-- on what to call it and none of them need two.
	region text,
	postal_code text,
	-- ISO 3166-1 alpha-2, validated in app code where the country list lives.
	country text,
	-- Set by a geocoder when there is one; the schema just stores them.
	latitude numeric(9, 6),
	longitude numeric(9, 6),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	is_primary boolean not null default false,
	-- Only a party has an address; a proposal or a product does not.
	constraint addresses_entity_is_party
		check (entity_type in ('company', 'contact')),
	constraint addresses_country_is_alpha2
		check (country is null or country ~ '^[A-Z]{2}$'),
	constraint addresses_latitude_in_range
		check (latitude is null or latitude between -90 and 90),
	constraint addresses_longitude_in_range
		check (longitude is null or longitude between -180 and 180)
);

comment on table public.addresses is
	'A postal address belonging to a company or a contact. `kind` is its purpose, `is_primary` picks the one shown on the record.';

create index addresses_org_id_idx on public.addresses (org_id);
create index addresses_entity_idx on public.addresses (org_id, entity_type, entity_id);

-- At most one primary per party. A partial unique index says it without a
-- trigger and without forbidding several addresses of the same kind.
create unique index addresses_one_primary_per_entity_idx
	on public.addresses (entity_type, entity_id)
	where is_primary;

create trigger addresses_set_updated_at
	before update on public.addresses
	for each row execute procedure public.set_updated_at();

create trigger addresses_check_entity
	before insert or update of org_id, entity_type, entity_id on public.addresses
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- contact_profiles — a contact's login to a client-facing app
-- ---------------------------------------------------------------------------

-- `profiles` is identity for the people who work HERE. This is identity for the
-- people you work FOR: the row that ties an auth user to the contact record a
-- portal would show them. Nothing renders it yet — the point of shipping it now
-- is that the link exists before the portal does, so accepting a proposal or
-- paying an invoice from a client login is a feature, not a schema migration.
--
-- One user can hold a profile in several orgs (your dentist and your roofer
-- both have you on file), so the identity is (org_id, user_id), not the user
-- alone — and each contact has at most one login.
create table public.contact_profiles (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	contact_id uuid not null,
	invited_at timestamptz,
	last_seen_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (contact_id, org_id) references public.contacts (id, org_id) on delete cascade,
	unique (org_id, user_id),
	unique (org_id, contact_id)
);

comment on table public.contact_profiles is
	'Links an auth user to the contact they are, for a client-facing app. A portal user is NOT an organization_member, so every existing policy already excludes them.';

create index contact_profiles_user_id_idx on public.contact_profiles (user_id);
create index contact_profiles_contact_id_idx on public.contact_profiles (contact_id);

create trigger contact_profiles_set_updated_at
	before update on public.contact_profiles
	for each row execute procedure public.set_updated_at();

-- Signup gives every new auth user a personal organization (see the
-- organizations migration), which is right for someone signing up to USE the
-- product and wrong for a client accepting a portal invitation — they would
-- land as the owner of an org they never asked for. The account kind travels in
-- the signup metadata, the way the display name already does.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	new_org_id uuid;
begin
	insert into public.profiles (id, display_name, avatar_url)
	values (
		new.id,
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'avatar_url'
	);

	-- A portal account belongs to somebody else's organization; it never owns
	-- one. Anything that is not explicitly 'portal' is a staff signup, so the
	-- default path is unchanged.
	if coalesce(new.raw_user_meta_data ->> 'account_type', 'staff') = 'portal' then
		return new;
	end if;

	insert into public.organizations (name)
	values (coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
	returning id into new_org_id;

	insert into public.organization_members (org_id, user_id, role)
	values (new_org_id, new.id, 'owner');

	return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The renamed tables keep the policies they already had. The two new ones
-- follow crm_core: working data is member-writable, deletes are owner/admin.

alter table public.addresses enable row level security;
alter table public.contact_profiles enable row level security;

-- addresses ----------------------------------------------------------------

create policy "Members can view addresses"
	on public.addresses for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create addresses"
	on public.addresses for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update addresses"
	on public.addresses for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete addresses"
	on public.addresses for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- contact_profiles ---------------------------------------------------------

-- Two audiences, so two select policies: the staff who manage the roster, and
-- the portal user reading their own link. The portal user has no membership,
-- so `org_role` returns null for them — without the second policy they could
-- not see the row that says who they are.
create policy "Members can view their organization's contact profiles"
	on public.contact_profiles for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "A portal user can view their own contact profile"
	on public.contact_profiles for select to authenticated
	using (user_id = (select auth.uid()));

-- Granting a client a login is administrative, like assigning a role: never
-- something a member does in passing. Portal signup itself runs through the
-- service-role client, which ignores all of this.
create policy "Owners and admins can link a contact profile"
	on public.contact_profiles for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update a contact profile"
	on public.contact_profiles for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can unlink a contact profile"
	on public.contact_profiles for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- Deliberately no policy lets a portal user read `contacts`, `proposals` or
-- anything else yet: the portal's read surface is its own migration, written
-- when the portal is. Until then a contact_profiles row grants a login and
-- nothing more, which is the safe direction to be wrong in.

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- Re-issued in full for every table whose columns moved, rather than patched:
-- a grant list is the readable statement of what the browser may write, and
-- half of one spread over two migrations is not.

revoke insert, update on table public.companies from authenticated;
grant insert (org_id, name, email, phone, website, status, relationship, created_by),
	update (name, email, phone, website, status, relationship)
	on table public.companies to authenticated;

revoke insert, update on table public.contacts from authenticated;
grant insert (org_id, company_id, name, email, phone, title, is_primary, status, created_by),
	update (company_id, name, email, phone, title, is_primary, status)
	on table public.contacts to authenticated;

revoke insert, update on table public.deals from authenticated;
grant insert (org_id, company_id, contact_id, title, amount, stage, expected_close_date,
		assigned_to, created_by),
	update (company_id, contact_id, title, amount, stage, expected_close_date, assigned_to)
	on table public.deals to authenticated;

revoke insert, update on table public.tasks from authenticated;
grant insert (org_id, company_id, contact_id, title, details, due_at, assigned_to, created_by),
	update (company_id, contact_id, title, details, due_at, completed_at, assigned_to)
	on table public.tasks to authenticated;

revoke insert, update on table public.notes from authenticated;
grant insert (org_id, company_id, author_id, body),
	update (body)
	on table public.notes to authenticated;

revoke insert, update on table public.support_tickets from authenticated;
grant insert (org_id, company_id, contact_id, subject, description, priority, assigned_to,
		created_by),
	update (company_id, contact_id, subject, description, status, priority, assigned_to)
	on table public.support_tickets to authenticated;

-- entity_type/entity_id are writable on insert only: an address belongs to the
-- party it was created for, and moving one between records is a delete and a
-- create, not an update.
revoke insert, update on table public.addresses from authenticated;
grant insert (org_id, entity_type, entity_id, kind, label, line1, line2, city, region,
		postal_code, country, latitude, longitude, is_primary),
	update (kind, label, line1, line2, city, region, postal_code, country, latitude,
		longitude, is_primary)
	on table public.addresses to authenticated;

-- The link itself is immutable from the browser: re-pointing a login at a
-- different contact is an unlink and a relink, which leaves a trail.
revoke insert, update on table public.contact_profiles from authenticated;
grant insert (org_id, user_id, contact_id, invited_at),
	update (invited_at, last_seen_at)
	on table public.contact_profiles to authenticated;
