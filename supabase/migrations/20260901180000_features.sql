-- Feature registry: which capabilities exist, which industries include them,
-- which tiers unlock them, and per-org escape hatches. A feature is one
-- navigable capability (a page or a coherent cluster of pages) and owns a
-- route prefix. `src/lib/features/resolve.ts` folds these tables into one
-- mode per feature for the session — enabled / locked_visible / disabled /
-- hidden — and `src/hooks.server.ts` enforces that mode next to the auth
-- check, so a page is gated by existing rather than by remembering a check
-- in each load. The two axes the modes encode:
--
--   industry axis: not in the org's industry  -> hidden  (does not exist)
--   tier axis:     in the industry, not the plan -> locked_visible (upsell)
--
-- Features also REPLACE the `permissions` catalog from the roles migration:
-- a role grants read/manage on a feature, not on a page, so one catalog
-- drives navigation, the route gate, tier/industry availability and role
-- grants. The read/manage level survives — a role can see a feature without
-- being able to edit inside it.

-- One enum for the resolver's output and the override column, so the app's
-- FeatureMode type derives from the generated types.
create type public.feature_mode as enum ('enabled', 'locked_visible', 'disabled', 'hidden');

-- ---------------------------------------------------------------------------
-- features — the registry
-- ---------------------------------------------------------------------------

create table public.features (
	id text not null primary key,
	name text not null,
	description text,
	-- The route prefix this feature owns: the gate matches a request against
	-- it (longest prefix wins, '/' would be exact-only) and the nav links to
	-- it. Unique so two features can never claim the same page.
	route text not null unique,
	-- A lucide icon slug, resolved by the one-per-file map in
	-- src/lib/features/icons.ts. Unknown slugs fall back to a placeholder.
	icon text,
	-- Sidebar section; mirrors NavCategoryKey in src/lib/navigation.ts.
	category text not null default 'platform'
		check (category in ('platform', 'library')),
	sort_order integer not null default 0,
	created_at timestamptz not null default now()
);

comment on table public.features is
	'Registry of navigable capabilities. Reference data owned by migrations / the service role; clients only read it. Grows by migration as pages are built.';

-- The reference rows ship with the schema, not seed.sql — production needs
-- them too. Idempotent so a re-apply is a no-op. The CRM rows and 'staff'
-- carry the ids the roles and staff_management migrations granted on, so the
-- FK swap below keeps every grant.
insert into public.features (id, name, description, route, icon, category, sort_order) values
	('clients', 'Clients', 'The companies and people you work with.', '/clients', 'contact', 'platform', 10),
	('deals', 'Deals', 'Pipeline of opportunities, by stage and value.', '/deals', 'handshake', 'platform', 20),
	('tasks', 'Tasks', 'Follow-ups and to-dos, with due dates and owners.', '/tasks', 'list-checks', 'platform', 30),
	('tickets', 'Tickets', 'Support requests and their threads.', '/tickets', 'ticket', 'platform', 40),
	('staff', 'Staff', 'The people in your organization, their roles and invitations.', '/staff', 'users', 'platform', 50),
	('components', 'Components', 'The UI primitive inventory, for building screens.', '/components', 'blocks', 'library', 10),
	('best-practices', 'Best Practices', 'The conventions this codebase follows.', '/best-practices', 'book-open', 'library', 20)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- role_permissions now grants on features; the permissions catalog goes
-- ---------------------------------------------------------------------------

-- Every id the seeded grants point at exists in features by now, so the new
-- constraint validates against the existing rows. The composite primary key
-- follows the rename.
alter table public.role_permissions rename column permission_id to feature_id;
alter table public.role_permissions
	drop constraint role_permissions_permission_id_fkey,
	add constraint role_permissions_feature_id_fkey
		foreign key (feature_id) references public.features (id) on delete cascade;

comment on table public.role_permissions is
	'One feature granted by one role, at read or manage level. Reference data; rows live and die with their role.';

-- The permissions catalog itself goes; its policy goes with it.
drop table public.permissions;

-- Plain members should reach the library pages too, so the starter roles
-- grant them. Idempotent so a re-apply is a no-op.
insert into public.role_permissions (role_id, feature_id, level) values
	('b0000000-0000-0000-0000-000000000001', 'components', 'read'),
	('b0000000-0000-0000-0000-000000000001', 'best-practices', 'read'),
	('b0000000-0000-0000-0000-000000000003', 'components', 'read')
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_features — which verticals include a feature at all
-- ---------------------------------------------------------------------------

create table public.industry_features (
	industry_id text not null references public.industries (id) on delete cascade,
	feature_id text not null references public.features (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (industry_id, feature_id)
);

comment on table public.industry_features is
	'A feature that exists for an industry. Absent means hidden: the feature does not exist for orgs in that industry. Reference data shipped by migration.';

create index industry_features_feature_id_idx on public.industry_features (feature_id);

insert into public.industry_features (industry_id, feature_id) values
	('general', 'clients'),
	('general', 'deals'),
	('general', 'tasks'),
	('general', 'tickets'),
	('general', 'staff'),
	('general', 'components'),
	('general', 'best-practices'),
	('construction', 'clients'),
	('construction', 'tasks'),
	('construction', 'tickets'),
	('construction', 'staff'),
	('construction', 'components')
on conflict (industry_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- tier_features — which plans unlock a feature, within an industry that has it
-- ---------------------------------------------------------------------------

create table public.tier_features (
	tier_id text not null references public.tiers (id) on delete cascade,
	feature_id text not null references public.features (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (tier_id, feature_id)
);

comment on table public.tier_features is
	'A feature a tier unlocks. In the industry but not the tier means locked_visible: shown, teasing an upgrade. Reference data shipped by migration.';

create index tier_features_feature_id_idx on public.tier_features (feature_id);

-- Tiers nest: pro is free plus deals, enterprise is pro plus best-practices.
-- Staff is in every tier — it is universal, gated by role grants alone.
-- A trial tier is one more row in tiers plus its rows here.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'clients'),
	('free', 'tasks'),
	('free', 'tickets'),
	('free', 'staff'),
	('free', 'components'),
	('pro', 'clients'),
	('pro', 'tasks'),
	('pro', 'tickets'),
	('pro', 'staff'),
	('pro', 'components'),
	('pro', 'deals'),
	('enterprise', 'clients'),
	('enterprise', 'tasks'),
	('enterprise', 'tickets'),
	('enterprise', 'staff'),
	('enterprise', 'components'),
	('enterprise', 'deals'),
	('enterprise', 'best-practices')
on conflict (tier_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- organization_feature_overrides — the per-org escape hatch
-- ---------------------------------------------------------------------------

-- Pilots, one-off deals, a feature pulled from one customer: an override
-- wins over industry and tier. Written by operators (SQL / service role /
-- billing code) only — exactly the tier_id mechanism, no browser write path.
-- 'disabled' is the org's own choice and lives in the table after this one.
create table public.organization_feature_overrides (
	org_id uuid not null references public.organizations (id) on delete cascade,
	feature_id text not null references public.features (id) on delete cascade,
	mode public.feature_mode not null check (mode <> 'disabled'),
	-- Why this override exists ("pilot until Q3"), for whoever finds it later.
	note text,
	created_at timestamptz not null default now(),
	primary key (org_id, feature_id)
);

comment on table public.organization_feature_overrides is
	'Per-org override of the industry/tier resolution: enabled, locked_visible or hidden. Set by operators only; members can read their own org''s rows.';

create index organization_feature_overrides_feature_id_idx
	on public.organization_feature_overrides (feature_id);

-- ---------------------------------------------------------------------------
-- organization_disabled_features — features the org switched off itself
-- ---------------------------------------------------------------------------

-- The self-service axis: of everything available to the org, which it has
-- chosen not to use. Pure join rows, owner/admin writable, and only for a
-- feature that is actually available (the insert policy checks the mode).
create table public.organization_disabled_features (
	org_id uuid not null references public.organizations (id) on delete cascade,
	feature_id text not null references public.features (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (org_id, feature_id)
);

comment on table public.organization_disabled_features is
	'A feature an org turned off for itself. Resolves to the disabled mode. Owner/admin add and remove rows; never edited.';

create index organization_disabled_features_feature_id_idx
	on public.organization_disabled_features (feature_id);

-- ---------------------------------------------------------------------------
-- private.feature_level — what the caller's roles grant on a feature
-- ---------------------------------------------------------------------------

-- The staff_management migration's permission_level, keyed by feature. Same
-- schema (never exposed as RPC), SECURITY DEFINER so it reads member_roles /
-- role_permissions without tripping their own RLS, empty search_path forcing
-- qualified names. Levels are a ladder, read < manage < delete, and owners
-- and admins implicitly hold 'delete' (the top rung) on everything;
-- otherwise the strongest level across the caller's roles in the org's
-- CURRENT industry wins; null means no access at all. Because the ladder is
-- ordered, policies compare with `in (...)` or `>=`, never `= 'manage'`.
create function private.feature_level(org uuid, feature text)
returns public.permission_level
language sql stable
security definer
set search_path = ''
as $$
	select case
		when private.org_role(org) in ('owner', 'admin') then 'delete'::public.permission_level
		else (
			select max(rp.level)
			from public.member_roles mr
			join public.roles r on r.id = mr.role_id and r.industry_id = private.org_industry(org)
			join public.role_permissions rp on rp.role_id = mr.role_id
			where mr.org_id = org
				and mr.user_id = (select auth.uid())
				and rp.feature_id = feature
		)
	end
$$;

-- ---------------------------------------------------------------------------
-- The policies that called private.permission_level move to feature_level
-- ---------------------------------------------------------------------------

-- Same bodies as the staff_management migration, keyed by the 'staff'
-- feature. Postgres refuses to drop a function a policy depends on, so the
-- policies are re-created first and the old function dropped last.
drop policy "Staff managers can view their org's invites" on public.organization_invites;
drop policy "Staff managers can create invites" on public.organization_invites;
drop policy "Staff managers can revoke invites" on public.organization_invites;
drop policy "Members can leave and managers can remove members" on public.organization_members;

create policy "Staff managers can view their org's invites"
	on public.organization_invites
	for select
	to authenticated
	using (private.feature_level(org_id, 'staff') in ('manage', 'delete'));

create policy "Staff managers can create invites"
	on public.organization_invites
	for insert
	to authenticated
	with check (
		private.feature_level(org_id, 'staff') in ('manage', 'delete')
		and invited_by = (select auth.uid())
	);

create policy "Staff managers can revoke invites"
	on public.organization_invites
	for delete
	to authenticated
	using (private.feature_level(org_id, 'staff') in ('manage', 'delete'));

create policy "Members can leave and managers can remove members"
	on public.organization_members
	for delete
	to authenticated
	using (
		user_id = (select auth.uid())
		or private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
		or (private.feature_level(org_id, 'staff') = 'delete' and role = 'member')
	);

drop function private.permission_level(uuid, text);

-- ---------------------------------------------------------------------------
-- private.feature_mode — the resolver, for policies that need it
-- ---------------------------------------------------------------------------

-- Mirrors src/lib/features/resolve.ts exactly — keep the two in sync:
--   1. override hidden / locked_visible          -> that mode
--   2. override enabled, or in industry AND tier -> disabled if the org
--                                                   switched it off, else enabled
--   3. in industry (but not the tier)            -> locked_visible
--   4. otherwise                                 -> hidden
-- Same schema and SECURITY DEFINER rationale as the helpers above.
create function private.feature_mode(org uuid, feature text)
returns public.feature_mode
language sql stable
security definer
set search_path = ''
as $$
	with state as (
		select
			(select mode from public.organization_feature_overrides
				where org_id = org and feature_id = feature) as override,
			exists (select 1 from public.industry_features
				where industry_id = private.org_industry(org) and feature_id = feature) as in_industry,
			exists (select 1 from public.tier_features
				where tier_id = private.org_tier(org) and feature_id = feature) as in_tier,
			exists (select 1 from public.organization_disabled_features
				where org_id = org and feature_id = feature) as org_disabled
	)
	select case
		when override in ('hidden', 'locked_visible') then override
		when override = 'enabled' or (in_industry and in_tier) then
			(case when org_disabled then 'disabled' else 'enabled' end)::public.feature_mode
		when in_industry then 'locked_visible'::public.feature_mode
		else 'hidden'::public.feature_mode
	end
	from state
$$;

-- The boolean most policies want: is the feature in normal use for the org?
create function private.feature_enabled(org uuid, feature text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select private.feature_mode(org, feature) = 'enabled'
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.features enable row level security;
alter table public.industry_features enable row level security;
alter table public.tier_features enable row level security;
alter table public.organization_feature_overrides enable row level security;
alter table public.organization_disabled_features enable row level security;

-- The registry and its industry/tier maps are reference data: readable by
-- every signed-in user (the nav, the upgrade page and the feature settings
-- render from them), select-only — no write policies, so only migrations /
-- the service role change them.
create policy "Authenticated users can read the feature registry"
	on public.features for select to authenticated
	using (true);

create policy "Authenticated users can read industry features"
	on public.industry_features for select to authenticated
	using (true);

create policy "Authenticated users can read tier features"
	on public.tier_features for select to authenticated
	using (true);

-- Overrides: members see their own org's rows (the resolver needs them);
-- deliberately no write policies at all.
create policy "Members can view their organization's feature overrides"
	on public.organization_feature_overrides for select to authenticated
	using (private.org_role(org_id) is not null);

-- Disabled features: members see them, owners/admins add and remove them.
-- The insert check refuses a row for a feature that is locked or hidden for
-- the org, so an owner cannot manufacture a 'disabled' state for something
-- they never had. Deliberately no UPDATE policy: pure join rows.
create policy "Members can view their organization's disabled features"
	on public.organization_disabled_features for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can disable an available feature"
	on public.organization_disabled_features for insert to authenticated
	with check (
		private.org_role(org_id) in ('owner', 'admin')
		and private.feature_mode(org_id, feature_id) in ('enabled', 'disabled')
	);

create policy "Owners and admins can re-enable a feature"
	on public.organization_disabled_features for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a client may write, these decide which COLUMNS —
-- exactly the organizations/tier_id mechanism. The service-role client
-- ignores all of this.

-- Reference data and overrides: no client writes at all.
revoke insert, update on table public.features from authenticated;
revoke insert, update on table public.industry_features from authenticated;
revoke insert, update on table public.tier_features from authenticated;
revoke insert, update on table public.organization_feature_overrides from authenticated;

-- Disabled rows have nothing editable, so no update grant at all.
revoke insert, update on table public.organization_disabled_features from authenticated;
grant insert (org_id, feature_id) on table public.organization_disabled_features to authenticated;

-- ---------------------------------------------------------------------------
-- How to add a feature
-- ---------------------------------------------------------------------------
-- 1. Create the route under src/routes/(app)/<route>/.
-- 2. In a migration: insert into public.features (id, name, description,
--    route, icon, category, sort_order), then the industry_features rows for
--    every industry that has it and the tier_features rows for every tier
--    that unlocks it — plus role_permissions grants if plain members need it.
-- 3. Add the id to FEATURE_IDS in src/lib/features/types.ts so app code gets
--    a typed key, and make sure the icon slug is in src/lib/features/icons.ts.
-- 4. npm run db:types, commit the regenerated src/lib/database.types.ts.
-- No nav edit: the sidebar and ⌘K palette render from the registry.
--
-- Gating stays in app code by default (the hook enforces the mode and the
-- read grant; actions call requirePermission(access, 'key', 'manage')).
-- When a feature is a real security boundary, wire its tables' RLS like
-- (the ladder is ordered, so compare with `in (...)`, never `= 'manage'`):
--   select: using (private.feature_enabled(org_id, '<key>')
--                  and private.feature_level(org_id, '<key>') is not null)
--   write:  with check (private.feature_enabled(org_id, '<key>')
--                       and private.feature_level(org_id, '<key>') in ('manage', 'delete'))
