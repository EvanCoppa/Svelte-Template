-- Platform operators: the people who run the deployment, as opposed to the
-- owners and admins who run one organization. An operator opens /admin, the
-- console that edits the reference data every other table treats as
-- migration / service-role territory: the feature registry and its industry
-- and tier maps, the role catalog and its grants, and per-organization
-- plans, industries, feature overrides and memberships. The console writes
-- through the service-role client, so nothing here widens an RLS policy —
-- this table only decides who may open it.
--
-- Deliberately not a feature and not an org role: it is global, and the
-- sidebar never shows it. Rows are added by migration or SQL, never from
-- the browser.
create table public.platform_operators (
	user_id uuid not null primary key references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

comment on table public.platform_operators is
	'Who may open the /admin operator console. Global, not per org; written by migrations / the service role only.';

alter table public.platform_operators enable row level security;

-- A user may learn whether they are an operator (the console's gate reads
-- this with the request client); nobody sees anyone else's row, and there
-- are no write policies.
create policy "Users can see their own operator row"
	on public.platform_operators
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- Reference data: no client writes at all.
revoke insert, update on table public.platform_operators from authenticated;

-- Bootstrap the template's maintainer. The lookup is by email so the same
-- migration works on every database the account exists in, and is a no-op
-- rather than an error where it does not — CI's disposable database has no
-- users at all. supabase/seed.sql adds the seeded copy of the same account
-- for the local stack.
insert into public.platform_operators (user_id)
select id from auth.users where email = 'evancoppa@gmail.com'
on conflict (user_id) do nothing;
