-- Staff management: everything the /staff page needs.
--
--   1. a 'staff' permission key (view the roster / manage invites / remove
--      members — the first page to use all three permission levels)
--   2. profiles grow a database-owned email column plus a shared-org select
--      policy, so the roster can show who a member actually is
--   3. organization_members gets a second FK to profiles so PostgREST can
--      embed the profile in the roster query
--   4. organization_invites — pending invitations, one row per single-use
--      invite link, consumed (deleted) on acceptance
--   5. private.permission_level() learns the 'delete' level added by the
--      previous migration
--   6. members holding staff 'delete' may remove plain members

-- gen_random_bytes (invite tokens) comes from pgcrypto. Hosted projects and
-- the local stack both ship it, but the guard keeps a bare Postgres honest.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- permissions — the 'staff' key
-- ---------------------------------------------------------------------------

insert into public.permissions (id, name) values
	('staff', 'Staff')
on conflict (id) do nothing;

-- General's Support role can see the roster (read, not manage) — the fixture
-- proving a plain member can hold view-only staff access.
insert into public.role_permissions (role_id, permission_id, level) values
	('b0000000-0000-0000-0000-000000000001', 'staff', 'read')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- private.permission_level — owners/admins now hold the top rung
-- ---------------------------------------------------------------------------

-- Same body as the roles_permissions migration except the implicit grant:
-- owners and admins hold 'delete' (the strongest level) on everything, not
-- 'manage', so policies gating on the new level keep working for them.
-- Because the ladder is ordered, policies should compare with `in (...)` or
-- `>=`, never `= 'manage'` — a 'delete' holder is a manager too.
create or replace function private.permission_level(org uuid, permission text)
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
				and rp.permission_id = permission
		)
	end
$$;

-- ---------------------------------------------------------------------------
-- profiles.email — a database-owned copy of the auth email
-- ---------------------------------------------------------------------------

-- The roster has to say who a membership row IS, and auth.users is not
-- readable from the client. The column is written only by the triggers below
-- (the column grants exclude it), so it cannot drift from the real account
-- email by user edit.
alter table public.profiles
	add column email text;

comment on column public.profiles.email is
	'Copy of auth.users.email, maintained by trigger. Never written by clients.';

-- Keep signup writing it. This is the organizations migration's body plus
-- the email column — replacing the whole function is how handle_new_user
-- evolves (it already happened once, when organizations extended profiles).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	new_org_id uuid;
begin
	insert into public.profiles (id, display_name, avatar_url, email)
	values (
		new.id,
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'avatar_url',
		new.email
	);

	insert into public.organizations (name)
	values (coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
	returning id into new_org_id;

	insert into public.organization_members (org_id, user_id, role)
	values (new_org_id, new.id, 'owner');

	return new;
end;
$$;

-- Follow email changes (GoTrue updates auth.users after the change is
-- confirmed). SECURITY DEFINER for the same reason as handle_new_user: the
-- firing user holds no profiles UPDATE grant for this column.
create function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.profiles set email = new.email where id = new.id;
	return new;
end;
$$;

create trigger on_auth_user_email_updated
	after update of email on auth.users
	for each row
	when (old.email is distinct from new.email)
	execute procedure public.handle_user_email_updated();

-- Backfill users that signed up before this migration.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- Column-level grants: profiles previously relied on RLS alone, which left
-- every column user-writable on the user's own row. Tightening to the two
-- fields the settings page edits is what keeps `email` database-owned.
revoke insert, update on table public.profiles from authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

-- Members can see the profiles of people they share an org with — the roster
-- (and any future assignee/author display) needs names for co-members, not
-- just the caller's own row. Policies OR together, so the self policy from
-- the profiles migration stays as-is. The helper lives in `private` like
-- org_role: SECURITY DEFINER so the organization_members lookups skip that
-- table's own RLS, empty search_path forcing qualified names.
create function private.shares_org_with(target uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.organization_members mine
		join public.organization_members theirs on theirs.org_id = mine.org_id
		where mine.user_id = (select auth.uid())
			and theirs.user_id = target
	)
$$;

create policy "Members can view profiles of users sharing an organization"
	on public.profiles
	for select
	to authenticated
	using (private.shares_org_with(id));

-- ---------------------------------------------------------------------------
-- organization_members → profiles, for the roster embed
-- ---------------------------------------------------------------------------

-- user_id already references auth.users; this second FK (to profiles, which
-- is 1:1 with auth.users and created by trigger before any membership can
-- exist) is what lets PostgREST embed `profiles(...)` in a members query.
alter table public.organization_members
	add constraint organization_members_user_id_profiles_fkey
		foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- organization_members — staff 'delete' holders may remove plain members
-- ---------------------------------------------------------------------------

-- Same policy as the organizations migration plus the last clause: a member
-- whose role grants staff at 'delete' can remove members, but never owners
-- or admins — deposing the hierarchy stays an owner/admin affair. The clause
-- is redundant for owners/admins (their own clauses already match), so the
-- behavior they had is unchanged.
drop policy "Members can leave and managers can remove members"
	on public.organization_members;

create policy "Members can leave and managers can remove members"
	on public.organization_members
	for delete
	to authenticated
	using (
		user_id = (select auth.uid())
		or private.org_role(org_id) = 'owner'
		or (private.org_role(org_id) = 'admin' and role <> 'owner')
		or (private.permission_level(org_id, 'staff') = 'delete' and role = 'member')
	);

-- ---------------------------------------------------------------------------
-- organization_invites — pending invitations
-- ---------------------------------------------------------------------------

-- One row per single-use invite. `email` set = a personal invite delivered by
-- email; null = a shareable link (the /staff "Copy invite link" button).
-- Accepting consumes the row (the accept endpoint deletes it via the
-- service-role client after creating the membership), so this table only
-- ever holds pending invites — added and removed, never edited, exactly like
-- member_roles. Everyone joins as 'member'; promotion is a separate
-- owner/admin act on the roster.
create table public.organization_invites (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	email text,
	-- The capability: whoever presents it may join. Database-generated (48 hex
	-- chars), never client-chosen.
	token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
	invited_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default now() + interval '7 days'
);

comment on table public.organization_invites is
	'Pending invitations to join an org as a member. Single-use: accepting deletes the row. Tokens are secrets — only staff managers may select them.';

create index organization_invites_org_id_idx on public.organization_invites (org_id);

-- One pending personal invite per address per org; re-inviting replaces it
-- (delete + insert, so the old link dies). Link invites (null email) are
-- exempt — several can circulate at once.
create unique index organization_invites_org_email_key
	on public.organization_invites (org_id, lower(email))
	where email is not null;

alter table public.organization_invites enable row level security;

-- staff 'manage' is a real security boundary here, not navigation: rows
-- carry join-capability tokens, so viewing is as sensitive as creating.
-- The ladder means 'delete' implies 'manage' — hence `in`, not `=`.

create policy "Staff managers can view their org's invites"
	on public.organization_invites
	for select
	to authenticated
	using (private.permission_level(org_id, 'staff') in ('manage', 'delete'));

create policy "Staff managers can create invites"
	on public.organization_invites
	for insert
	to authenticated
	with check (
		private.permission_level(org_id, 'staff') in ('manage', 'delete')
		and invited_by = (select auth.uid())
	);

create policy "Staff managers can revoke invites"
	on public.organization_invites
	for delete
	to authenticated
	using (private.permission_level(org_id, 'staff') in ('manage', 'delete'));

-- Column-level grants: token and expires_at are database-owned defaults, and
-- there is deliberately no update grant (or policy) at all — an invite is
-- replaced, never edited. Acceptance goes through the service-role client,
-- which none of this constrains.
revoke insert, update on table public.organization_invites from authenticated;
grant insert (org_id, email, invited_by)
	on table public.organization_invites to authenticated;
