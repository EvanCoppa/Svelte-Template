-- System admins: the one role outside every industry's catalog. A platform
-- operator — whoever runs the product — holds owner-level access to every
-- organization, member of it or not.
--
-- It is deliberately NOT a row in public.roles. A role there is an
-- industry-scoped bundle handed to a member of one org through
-- member_roles; a system admin is neither industry-scoped nor a member,
-- and must reach orgs nobody ever invited them to. So the role is a table
-- of user ids, and one helper carries the grant: private.org_role() —
-- which every tenant policy already consults, and which feature_level()
-- derives from — answers 'owner' for a system admin on every org. Nothing
-- per table is wired, nothing in the app can list who holds it (a user can
-- only see their own row), no role picker can offer it (listRoles reads
-- public.roles by industry, and this is not in roles at all), and no client
-- can write it: the table is operator-owned — SQL / the service role —
-- exactly like organizations.tier_id and feature overrides.
--
-- The app mirrors the database: loadOrgContext() lists every organization
-- RLS shows a system admin and synthesises role 'owner', and the org
-- switcher / staff actions check org visibility rather than a membership
-- row (src/lib/server/org-context.ts, src/routes/api/org).
--
-- Owner everywhere means exactly that, destructive tail included: one
-- operator session can delete any organization, promote anyone, edit any
-- authored content. Keep the list short, put MFA on those accounts, and
-- remember that a membership an operator gave themselves outlives their
-- row here — revoke both.

-- ---------------------------------------------------------------------------
-- system_admins — who operates the platform
-- ---------------------------------------------------------------------------

create table public.system_admins (
	user_id uuid not null primary key references auth.users (id) on delete cascade,
	-- Why this person is an operator ("founder", "support engineer"), for
	-- whoever audits the list later — the same note overrides carry.
	note text,
	created_at timestamptz not null default now()
);

comment on table public.system_admins is
	'Platform operators: owner-level access to every organization, via private.org_role(). Written by SQL / the service role only; a user can read their own row.';

alter table public.system_admins enable row level security;

-- A user may learn whether THEY are an operator (the org context needs it
-- to list every org for them) and nothing about anyone else. Deliberately
-- select-only: no write policies, so only SQL / the service role changes
-- the list.
create policy "Users can see whether they are a system admin"
	on public.system_admins
	for select
	to authenticated
	using ((select auth.uid()) = user_id);

-- Operator-owned: no client writes at all, so nothing is granted back.
revoke insert, update on table public.system_admins from authenticated;

-- ---------------------------------------------------------------------------
-- private.is_system_admin — the check org_role() and shares_org_with() use
-- ---------------------------------------------------------------------------

-- Lives next to org_role: same schema (never exposed as RPC), SECURITY
-- DEFINER so it reads system_admins without tripping its own RLS, empty
-- search_path forcing qualified names. One primary-key lookup.
create function private.is_system_admin()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.system_admins where user_id = (select auth.uid())
	)
$$;

-- ---------------------------------------------------------------------------
-- private.org_role — a system admin is owner of every org
-- ---------------------------------------------------------------------------

-- The organizations migration's body with one clause in front: a system
-- admin's answer is 'owner' for any organization that exists, before any
-- membership row is consulted, so the operator flag wins even where they
-- also hold a lesser membership — and stays null for an id that names no
-- org, like the membership branch does. Every policy written against
-- org_role() — organizations, members, the CRM tables, invites, feature
-- opt-outs — and feature_level(), which grants owners 'delete' on
-- everything, inherit this without changing. Anonymous callers and
-- non-operators take exactly the path they took before.
create or replace function private.org_role(org uuid)
returns public.org_role
language sql stable
security definer
set search_path = ''
as $$
	select case
		when private.is_system_admin() then (
			select 'owner'::public.org_role from public.organizations where id = org
		)
		else (
			select role from public.organization_members
			where org_id = org and user_id = (select auth.uid())
		)
	end
$$;

-- ---------------------------------------------------------------------------
-- private.shares_org_with — a system admin can name anyone
-- ---------------------------------------------------------------------------

-- The staff_management migration's body plus the operator clause: a roster
-- shows who its members are through the profiles policy built on this
-- helper, and an operator opening an org they never joined must see the
-- same names a member does — otherwise the profile embed comes back null
-- for every row.
create or replace function private.shares_org_with(target uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select private.is_system_admin() or exists (
		select 1
		from public.organization_members mine
		join public.organization_members theirs on theirs.org_id = mine.org_id
		where mine.user_id = (select auth.uid())
			and theirs.user_id = target
	)
$$;

-- ---------------------------------------------------------------------------
-- Granting and revoking
-- ---------------------------------------------------------------------------
-- An operator is added and removed by SQL (or the service-role client from
-- an admin tool you build later), never from the browser:
--   insert into public.system_admins (user_id, note) values ('<uuid>', 'why');
--   delete from public.system_admins where user_id = '<uuid>';
-- Takes effect on the operator's next request — the app resolves it per
-- request in loadOrgContext(), and RLS evaluates it per statement.
--
-- What "owner of every org" deliberately does NOT do: the CRM tables'
-- assignee columns and notifications.user_id keep their composite foreign
-- keys to organization_members (crm_core migration), so an operator can
-- act on an org's data but cannot be assigned a deal, task or ticket there,
-- or receive its notifications, until they hold a real membership — being
-- reachable inside an org is a membership fact, not an access one.
