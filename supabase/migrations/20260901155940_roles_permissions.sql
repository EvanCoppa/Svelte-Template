-- Roles & permissions: an industry-scoped layer between org_role and the
-- app's pages. org_role stays the structural hierarchy (who administers the
-- org); roles are what an owner/admin hands out to members to gate which
-- pages/features they can see or manage. Roles and their grants are
-- reference data keyed by industry (the tiers mechanism): shipped by
-- migration, readable by every signed-in user, written only by migrations /
-- the service role — so onboarding a new org requires zero role setup.
-- Custom per-org roles are a deliberate future extension: they would add a
-- nullable org_id to roles plus org-scoped policies, and nothing here
-- forecloses that.

-- Levels are ordered by privilege ('read' < 'manage') so max() over the enum
-- picks the stronger grant when a user holds several roles.
create type public.permission_level as enum ('read', 'manage');

-- ---------------------------------------------------------------------------
-- permissions — the global catalog of gated pages/features
-- ---------------------------------------------------------------------------

create table public.permissions (
	id text not null primary key,
	name text not null,
	created_at timestamptz not null default now()
);

comment on table public.permissions is
	'Catalog of gated pages/features. Reference data owned by migrations / the service role; clients only read it. Grows by migration as pages are added.';

-- The reference rows ship with the schema, not seed.sql — production needs
-- them too. Idempotent so a re-apply is a no-op.
insert into public.permissions (id, name) values
	('clients', 'Clients'),
	('deals', 'Deals'),
	('tasks', 'Tasks'),
	('tickets', 'Tickets')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- industries — the catalog roles are scoped to
-- ---------------------------------------------------------------------------

-- A lookup table exactly like tiers (not an enum) so onboarding code can add
-- industries without a schema migration.
create table public.industries (
	id text not null primary key,
	name text not null,
	created_at timestamptz not null default now()
);

comment on table public.industries is
	'Industry catalog. Reference data owned by migrations / the service role; clients only read it. Every org belongs to exactly one, and roles are scoped to it.';

-- 'general' is the default every org gets on creation; 'construction' is the
-- reference second industry proving role sets can diverge. Idempotent so a
-- re-apply is a no-op.
insert into public.industries (id, name) values
	('general', 'General'),
	('construction', 'Construction')
on conflict (id) do nothing;

-- Which industry an org belongs to decides which role set applies to it.
-- The column grants from the organizations migration are deliberately NOT
-- widened: authenticated stays limited to `name`, so industry_id (exactly
-- like tier_id) is set by onboarding / service-role code only, never from
-- the browser.
alter table public.organizations
	add column industry_id text not null default 'general'
		references public.industries (id);

-- ---------------------------------------------------------------------------
-- roles — industry-scoped named bundles of permissions
-- ---------------------------------------------------------------------------

-- Industry-scoped on purpose: two industries can both define a 'Support'
-- role and give it entirely different permissions, and every org in an
-- industry shares that industry's role set with zero per-org setup.
create table public.roles (
	id uuid not null primary key default gen_random_uuid(),
	industry_id text not null references public.industries (id) on delete cascade,
	name text not null,
	description text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (industry_id, name)
);

comment on table public.roles is
	'A named bundle of permissions an owner/admin hands out to members. Industry-scoped reference data shipped by migration.';

create index roles_industry_id_idx on public.roles (industry_id);

create trigger roles_set_updated_at
	before update on public.roles
	for each row execute procedure public.set_updated_at();

-- The starter roles ship with the schema, not seed.sql — production needs
-- them too. Fixed uuids in the b0000000-… range (the reference-data id range
-- for this migration) so grants, assignments and seed fixtures can point at
-- them. Construction's 'Support' shares its name with general's 'Support'
-- but carries different grants — the cross-industry divergence fixture.
-- Idempotent so a re-apply is a no-op.
insert into public.roles (id, industry_id, name, description) values
	('b0000000-0000-0000-0000-000000000001', 'general', 'Support',
		'Works the ticket queue; can look clients up.'),
	('b0000000-0000-0000-0000-000000000002', 'general', 'Sales',
		'Runs clients and deals; sees tasks.'),
	('b0000000-0000-0000-0000-000000000003', 'construction', 'Support',
		'Manages the client list.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- role_permissions — what a role grants
-- ---------------------------------------------------------------------------

create table public.role_permissions (
	role_id uuid not null references public.roles (id) on delete cascade,
	permission_id text not null references public.permissions (id) on delete cascade,
	level public.permission_level not null default 'read',
	created_at timestamptz not null default now(),
	primary key (role_id, permission_id)
);

comment on table public.role_permissions is
	'One permission granted by one role, at read or manage level. Reference data; rows live and die with their role.';

-- The starter grants, matching the roles above. Idempotent so a re-apply is
-- a no-op.
insert into public.role_permissions (role_id, permission_id, level) values
	('b0000000-0000-0000-0000-000000000001', 'tickets', 'manage'),
	('b0000000-0000-0000-0000-000000000001', 'clients', 'read'),
	('b0000000-0000-0000-0000-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0000-000000000002', 'deals', 'manage'),
	('b0000000-0000-0000-0000-000000000002', 'tasks', 'read'),
	('b0000000-0000-0000-0000-000000000003', 'clients', 'manage')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- member_roles — which members hold which roles
-- ---------------------------------------------------------------------------

-- The one tenant-scoped table in this migration. A user can hold several
-- roles in an org; their permissions union across them
-- (private.permission_level below takes the max).
create table public.member_roles (
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null,
	role_id uuid not null references public.roles (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (org_id, user_id, role_id),
	-- Only actual members can hold roles; leaving the org clears assignments.
	foreign key (org_id, user_id) references public.organization_members (org_id, user_id)
		on delete cascade
);

comment on table public.member_roles is
	'Assignment of a role to a member. Pure join rows: added and removed, never edited.';

-- The PK covers org_id/user_id lookups; this covers the other direction
-- ("who holds this role?").
create index member_roles_role_id_idx on public.member_roles (role_id);

-- ---------------------------------------------------------------------------
-- private.org_industry — which industry an org is in
-- ---------------------------------------------------------------------------

-- Mirrors private.org_tier: same schema (never exposed as RPC), SECURITY
-- DEFINER so policies can consult it without an organizations SELECT policy
-- in the way, empty search_path forcing qualified names.
create function private.org_industry(org uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
	select industry_id from public.organizations where id = org
$$;

-- ---------------------------------------------------------------------------
-- private.permission_level — the check future policies and app code call
-- ---------------------------------------------------------------------------

-- Lives next to private.org_role: same schema (never exposed as RPC), same
-- SECURITY DEFINER rationale (reads member_roles/role_permissions without
-- tripping their own RLS), empty search_path forcing qualified names.
-- Owners and admins implicitly hold 'manage' on everything — the template
-- works before any roles are assigned, because every user owns their
-- personal org. Otherwise the strongest level across all the caller's roles
-- wins; null means no access at all. The join filters to the org's CURRENT
-- industry, so if an org's industry ever changes, assignments pointing at
-- another industry's roles go inert instead of still granting.
create function private.permission_level(org uuid, permission text)
returns public.permission_level
language sql stable
security definer
set search_path = ''
as $$
	select case
		when private.org_role(org) in ('owner', 'admin') then 'manage'::public.permission_level
		else (
			select max(rp.level)
			from public.member_roles mr
			join public.roles r on r.id = mr.role_id and r.industry_id = private.org_industry(org)
			join public.role_permissions rp on rp.role_id = mr.role_id
			where mr.org_id = org
				and mr.user_id = (select auth.uid())
				and rp.permission_id = permission
		)
	end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.permissions enable row level security;
alter table public.industries enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_roles enable row level security;

-- The permission catalog is readable by every signed-in user (the UI needs
-- it to render role editors and page names). Deliberately select-only: there
-- are no write policies, so only migrations / the service role change it.
create policy "Authenticated users can read the permission catalog"
	on public.permissions
	for select
	to authenticated
	using (true);

-- Same for the industry catalog (onboarding renders it as a picker).
create policy "Authenticated users can read the industry catalog"
	on public.industries
	for select
	to authenticated
	using (true);

-- roles / role_permissions -------------------------------------------------
-- Both are reference data: readable by every signed-in user (the assign UI
-- needs the role list and its grants to render), select-only — no write
-- policies, so only migrations / the service role change them. Custom
-- per-org roles are a deliberate future extension (a nullable org_id here
-- plus org-scoped write policies), not something these policies anticipate.

create policy "Authenticated users can read the role catalog"
	on public.roles for select to authenticated
	using (true);

create policy "Authenticated users can read role permissions"
	on public.role_permissions for select to authenticated
	using (true);

-- member_roles -------------------------------------------------------------
-- Deliberately no UPDATE policy: assignments are pure join rows, added and
-- removed, never edited.

create policy "Members can view role assignments"
	on public.member_roles for select to authenticated
	using (private.org_role(org_id) is not null);

-- Assigning also requires the role to belong to the org's industry — an
-- Acme owner cannot hand out a construction role to a general org. The
-- subquery on public.roles is safe here: the house rule against policies
-- querying organization_members directly is about recursion, and roles' own
-- policy is a bare using (true) that never touches member_roles, so no
-- cycle exists.
create policy "Owners and admins can assign roles from their org's industry"
	on public.member_roles for insert to authenticated
	with check (
		private.org_role(org_id) in ('owner', 'admin')
		and (select industry_id from public.roles where id = role_id)
			= private.org_industry(org_id)
	);

create policy "Owners and admins can unassign roles"
	on public.member_roles for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a client may write, these decide which COLUMNS —
-- exactly the organizations/tier_id mechanism. The service-role client
-- ignores all of this.

-- Reference data: no client writes at all, so nothing is granted back.
revoke insert, update on table public.roles from authenticated;
revoke insert, update on table public.role_permissions from authenticated;

-- Assignments have nothing editable, so no update grant at all.
revoke insert, update on table public.member_roles from authenticated;
grant insert (org_id, user_id, role_id) on table public.member_roles to authenticated;

-- Every permission-gated table you add later wires its RLS like this:
--   select: using (private.permission_level(org_id, '<key>') is not null)
--   write:  with check (private.permission_level(org_id, '<key>') = 'manage')
-- By default, though, page gating lives in app code (src/lib/server/roles.ts)
-- the same way tier gating does — reach for permission_level() in a policy
-- only when the permission is a real security boundary, not just navigation.
