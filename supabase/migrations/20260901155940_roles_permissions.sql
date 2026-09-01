-- Roles & permissions: a per-org layer between org_role and the app's pages.
-- org_role stays the structural hierarchy (who administers the org); roles are
-- what an owner/admin hands out to members to gate which pages/features they
-- can see or manage. Every table copies the canonical tenant shape from the
-- organizations migration: org_id → cascade, RLS on, membership via
-- private.org_role(), an index on org_id.

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
-- roles — org-scoped named bundles of permissions
-- ---------------------------------------------------------------------------

-- Org-scoped on purpose: two orgs can both define a 'Support' role and give
-- it entirely different permissions.
create table public.roles (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	description text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, name),
	-- Composite target for child-table FKs: referencing (id, org_id) makes it
	-- impossible for a child row to point at a role in a different org than
	-- its own org_id claims, without any trigger machinery.
	unique (id, org_id)
);

comment on table public.roles is
	'A named bundle of permissions an owner/admin hands out to members. Tenant-scoped.';

create index roles_org_id_idx on public.roles (org_id);

create trigger roles_set_updated_at
	before update on public.roles
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- role_permissions — what a role grants
-- ---------------------------------------------------------------------------

create table public.role_permissions (
	org_id uuid not null references public.organizations (id) on delete cascade,
	role_id uuid not null,
	permission_id text not null references public.permissions (id) on delete cascade,
	level public.permission_level not null default 'read',
	created_at timestamptz not null default now(),
	primary key (role_id, permission_id),
	-- The composite FK makes it impossible for a grant row to claim a
	-- different org than its role; deleting the role clears its grants.
	foreign key (role_id, org_id) references public.roles (id, org_id) on delete cascade
);

comment on table public.role_permissions is
	'One permission granted by one role, at read or manage level. Rows live and die with their role.';

create index role_permissions_org_id_idx on public.role_permissions (org_id);

-- ---------------------------------------------------------------------------
-- member_roles — which members hold which roles
-- ---------------------------------------------------------------------------

-- A user can hold several roles in an org; their permissions union across
-- them (private.permission_level below takes the max).
create table public.member_roles (
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null,
	role_id uuid not null,
	created_at timestamptz not null default now(),
	primary key (org_id, user_id, role_id),
	-- Only actual members can hold roles; leaving the org clears assignments.
	foreign key (org_id, user_id) references public.organization_members (org_id, user_id)
		on delete cascade,
	-- The role must belong to the same org; deleting a role clears its
	-- assignments.
	foreign key (role_id, org_id) references public.roles (id, org_id) on delete cascade
);

comment on table public.member_roles is
	'Assignment of a role to a member. Pure join rows: added and removed, never edited.';

-- The PK covers org_id/user_id lookups; this covers the other direction
-- ("who holds this role?").
create index member_roles_role_id_idx on public.member_roles (role_id);

-- ---------------------------------------------------------------------------
-- private.permission_level — the check future policies and app code call
-- ---------------------------------------------------------------------------

-- Lives next to private.org_role: same schema (never exposed as RPC), same
-- SECURITY DEFINER rationale (reads member_roles/role_permissions without
-- tripping their own RLS), empty search_path forcing qualified names.
-- Owners and admins implicitly hold 'manage' on everything — the template
-- works before any roles exist, because every user owns their personal org.
-- Otherwise the strongest level across all the caller's roles wins; null
-- means no access at all.
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

-- roles --------------------------------------------------------------------

create policy "Members can view roles"
	on public.roles for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create roles"
	on public.roles for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update roles"
	on public.roles for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete roles"
	on public.roles for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- role_permissions ---------------------------------------------------------

create policy "Members can view role permissions"
	on public.role_permissions for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can grant permissions to roles"
	on public.role_permissions for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can change permission levels"
	on public.role_permissions for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can revoke permissions from roles"
	on public.role_permissions for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- member_roles -------------------------------------------------------------
-- Deliberately no UPDATE policy: assignments are pure join rows, added and
-- removed, never edited.

create policy "Members can view role assignments"
	on public.member_roles for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can assign roles"
	on public.member_roles for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can unassign roles"
	on public.member_roles for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a manager may write, these decide which COLUMNS —
-- exactly the organizations/tier_id mechanism. Excluding org_id from every
-- update grant makes rows unmovable between orgs. The service-role client
-- ignores all of this.

revoke insert, update on table public.roles from authenticated;
grant insert (org_id, name, description),
	update (name, description)
	on table public.roles to authenticated;

revoke insert, update on table public.role_permissions from authenticated;
grant insert (org_id, role_id, permission_id, level),
	update (level)
	on table public.role_permissions to authenticated;

-- Assignments have nothing editable, so no update grant at all.
revoke insert, update on table public.member_roles from authenticated;
grant insert (org_id, user_id, role_id) on table public.member_roles to authenticated;

-- Every permission-gated table you add later wires its RLS like this:
--   select: using (private.permission_level(org_id, '<key>') is not null)
--   write:  with check (private.permission_level(org_id, '<key>') = 'manage')
-- By default, though, page gating lives in app code (src/lib/server/roles.ts)
-- the same way tier gating does — reach for permission_level() in a policy
-- only when the permission is a real security boundary, not just navigation.
