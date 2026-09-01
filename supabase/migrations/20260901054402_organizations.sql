-- Multi-tenant foundation: organizations + memberships, RLS built on
-- security-definer helpers, and a personal org for every user on signup.
--
-- This migration is also the reference pattern for tenancy. Every table you
-- add later that belongs to an org copies the shape in the comment block at
-- the bottom of this file.

-- Roles are ordered by privilege. Tiers are a lookup table (not an enum) so
-- billing code can add plans or change display names without a schema
-- migration. Only `name` is safely renamable — `id` is referenced by
-- organizations.tier_id with no `on update cascade`, so treat ids as fixed.
create type public.org_role as enum ('owner', 'admin', 'member');

create table public.tiers (
	id text not null primary key,
	name text not null,
	created_at timestamptz not null default now()
);

comment on table public.tiers is
	'Plan catalog. Reference data owned by the service role / billing code; clients only read it.';

-- The reference rows ship with the schema, not seed.sql — production needs
-- them too. Idempotent so a re-apply is a no-op.
insert into public.tiers (id, name) values
	('free', 'Free'),
	('pro', 'Pro'),
	('enterprise', 'Enterprise')
on conflict (id) do nothing;

create table public.organizations (
	id uuid not null primary key default gen_random_uuid(),
	name text not null,
	tier_id text not null default 'free' references public.tiers (id),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.organizations is
	'A tenant. Every user gets a personal org on signup; more can be created and shared.';

-- Keep updated_at honest on every write (function comes from the profiles
-- migration).
create trigger organizations_set_updated_at
	before update on public.organizations
	for each row execute procedure public.set_updated_at();

create table public.organization_members (
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role public.org_role not null default 'member',
	created_at timestamptz not null default now(),
	primary key (org_id, user_id)
);

comment on table public.organization_members is
	'Which users belong to which org, and with what role. The join table every tenant policy consults.';

-- The PK covers org_id lookups; this covers the other direction ("which orgs
-- am I in?"), which every session hits.
create index organization_members_user_id_idx on public.organization_members (user_id);

-- Helper functions live in `private` so PostgREST never exposes them as RPC.
-- They are SECURITY DEFINER on purpose: a policy on organization_members that
-- queried organization_members directly would recurse infinitely. The definer
-- context bypasses RLS inside the function, breaking the cycle — the pattern
-- recommended by the Supabase RLS docs. Empty search_path forces fully
-- qualified names.
--
-- Clients cannot call these helpers only because `private` has no USAGE grant
-- for authenticated/anon — granting USAGE later would let any signed-in user
-- probe org_tier(<any uuid>). Keep the schema ungranted.
create schema if not exists private;

create function private.org_role(org uuid)
returns public.org_role
language sql stable
security definer
set search_path = ''
as $$
	select role from public.organization_members
	where org_id = org and user_id = (select auth.uid())
$$;

create function private.org_tier(org uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
	select tier_id from public.organizations where id = org
$$;

-- RLS: membership decides visibility, role decides writes. All policies are
-- `to authenticated`; anon sees nothing, and the service-role client bypasses
-- RLS entirely (billing code updating tier_id goes through it).
alter table public.tiers enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- The tier catalog is readable by every signed-in user (it is public pricing
-- metadata, needed to render plan names). Deliberately select-only: there are
-- no write policies, so only the service-role / billing code changes it.
create policy "Authenticated users can read the tier catalog"
	on public.tiers
	for select
	to authenticated
	using (true);

create policy "Members can view their organizations"
	on public.organizations
	for select
	to authenticated
	using (private.org_role(id) is not null);

-- Any signed-in user may create an org. `with check (true)` is safe here
-- because the column grants below limit what they can write to `name` only,
-- and the auto-owner trigger makes them owner of what they created.
create policy "Authenticated users can create organizations"
	on public.organizations
	for insert
	to authenticated
	with check (true);

create policy "Owners and admins can update their organizations"
	on public.organizations
	for update
	to authenticated
	using (private.org_role(id) in ('owner', 'admin'))
	with check (private.org_role(id) in ('owner', 'admin'));

create policy "Owners can delete their organizations"
	on public.organizations
	for delete
	to authenticated
	using (private.org_role(id) = 'owner');

create policy "Members can view their organization's members"
	on public.organization_members
	for select
	to authenticated
	using (private.org_role(org_id) is not null);

-- Owners manage everyone; admins manage everyone except owners (and cannot
-- grant the owner role).
create policy "Owners and admins can add members"
	on public.organization_members
	for insert
	to authenticated
	with check (
		private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
	);

create policy "Owners and admins can change member roles"
	on public.organization_members
	for update
	to authenticated
	using (
		private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
	)
	with check (
		private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
	);

-- Anyone can leave; owners remove anyone; admins remove non-owners.
create policy "Members can leave and managers can remove members"
	on public.organization_members
	for delete
	to authenticated
	using (
		user_id = (select auth.uid())
		or private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
	);

-- Column-level grants: RLS decides which ROWS a user may write, grants decide
-- which COLUMNS. Restricting authenticated to `name` means no client can ever
-- set or change `tier_id` — billing does that through the service-role client,
-- which is unaffected by these grants.
revoke insert, update on table public.organizations from authenticated;
grant insert (name), update (name) on table public.organizations to authenticated;

-- Whoever creates an org becomes its owner, atomically — without this, a
-- creator with no membership row could never see the org they just made.
-- SECURITY DEFINER because the creator has no INSERT policy that would let
-- them write an 'owner' row themselves. The null check matters: seed.sql and
-- handle_new_user() insert organizations with no JWT in play (auth.uid() is
-- null there), and they create their own membership rows — skipping keeps
-- this trigger from double-firing in those paths.
create function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is not null then
		insert into public.organization_members (org_id, user_id, role)
		values (new.id, (select auth.uid()), 'owner');
	end if;
	return new;
end;
$$;

create trigger on_organization_created
	after insert on public.organizations
	for each row execute procedure public.handle_new_organization();

-- The sanctioned create path for clients: `supabase.rpc('create_organization',
-- { org_name })`. A bare `.insert().select()` cannot work — the SELECT policy
-- is evaluated on the RETURNING row before the AFTER trigger has written the
-- owner membership, so `private.org_role(id)` is still null and PostgREST
-- returns 42501. SECURITY DEFINER sidesteps that ordering while the explicit
-- auth.uid() check keeps it authenticated-only.
create function public.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	new_org uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'create_organization requires an authenticated caller';
	end if;
	insert into public.organizations (name) values (org_name) returning id into new_org;
	-- handle_new_organization ran with the caller's auth.uid(), so the owner
	-- membership already exists.
	return new_org;
end;
$$;

revoke execute on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- Extend signup: keep the profile row from the profiles migration, then give
-- the new user a personal organization (free tier) they own. Named after
-- their full name, falling back to the local part of their email, then to
-- 'Personal' — anonymous/phone/OAuth users can have neither, and a null name
-- here would abort the whole signup.
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

	insert into public.organizations (name)
	values (coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Personal'))
	returning id into new_org_id;

	insert into public.organization_members (org_id, user_id, role)
	values (new_org_id, new.id, 'owner');

	return new;
end;
$$;

-- Backfill: users who existed before this migration get their personal org
-- here. Idempotent — only users with zero memberships qualify, so a re-run
-- (or a seeded user) is a no-op.
do $$
declare
	u record;
	new_org_id uuid;
begin
	for u in
		select
			users.id,
			coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1), 'Personal') as org_name
		from auth.users users
		where not exists (
			select 1 from public.organization_members m where m.user_id = users.id
		)
	loop
		insert into public.organizations (name)
		values (u.org_name)
		returning id into new_org_id;

		insert into public.organization_members (org_id, user_id, role)
		values (new_org_id, u.id, 'owner');
	end loop;
end;
$$;

-- Every tenant-scoped table you add later copies this shape:
--   org_id uuid not null references public.organizations (id) on delete cascade
--   enable row level security
--   select: using (private.org_role(org_id) is not null)
--   write:  with check (private.org_role(org_id) in ('owner','admin'))
--   tier-gated feature: and private.org_tier(org_id) in ('pro','enterprise')
--   create index <table>_org_id_idx on public.<table> (org_id);
--
-- Create orgs via `supabase.rpc('create_organization', { org_name })` — a
-- bare `.insert().select()` on organizations fails because the SELECT policy
-- runs before the owner-membership trigger.
