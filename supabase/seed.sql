-- Seed data for the LOCAL stack only.
--
-- Applied by `npm run db:reset`, after every migration in supabase/migrations.
-- It never runs against a hosted project, so the credentials below are fixed
-- and public on purpose: they exist so `npm run dev` and the Playwright suite
-- have a user to sign in as without anyone having to provision one by hand.
--
--   dev@example.com      / password123   ← sign in with this while developing
--   e2e@example.com      / password123   ← reserved for the E2E suite
--   evancoppa@gmail.com  / password123   ← same local password, not a real one
--
-- NEVER put a real credential in this file. It is committed.
--
-- Creating an auth user in SQL means writing the two rows GoTrue expects:
-- `auth.users` (the account) and `auth.identities` (the email login method).
-- A user with no identity row exists but cannot sign in with a password.
-- Columns like `confirmed_at` are GENERATED — assigning them is an error.

create temporary table seed_users (
	id uuid primary key,
	email text not null,
	password text not null,
	display_name text not null
);

-- Add a row here to add a user. Everything below is generic.
insert into seed_users (id, email, password, display_name) values
	('00000000-0000-0000-0000-000000000001', 'dev@example.com', 'password123', 'Dev User'),
	('00000000-0000-0000-0000-000000000002', 'e2e@example.com', 'password123', 'E2E Robot'),
	('00000000-0000-0000-0000-000000000003', 'evancoppa@gmail.com', 'password123', 'Evan Coppa');

-- The account. `email_confirmed_at` is set so sign-in works immediately,
-- matching `enable_confirmations = false` in config.toml. The empty-string
-- token columns are what GoTrue writes for "no pending flow"; leaving them
-- NULL makes some of its queries error.
insert into auth.users (
	instance_id,
	id,
	aud,
	role,
	email,
	encrypted_password,
	email_confirmed_at,
	created_at,
	updated_at,
	raw_app_meta_data,
	raw_user_meta_data,
	confirmation_token,
	recovery_token,
	email_change_token_new,
	email_change
)
select
	'00000000-0000-0000-0000-000000000000',
	s.id,
	'authenticated',
	'authenticated',
	s.email,
	-- bcrypt, the same hash GoTrue writes. pgcrypto lives in `extensions`.
	extensions.crypt(s.password, extensions.gen_salt('bf')),
	now(),
	now(),
	now(),
	'{"provider":"email","providers":["email"]}'::jsonb,
	jsonb_build_object('full_name', s.display_name),
	'',
	'',
	'',
	''
from seed_users s
on conflict (id) do nothing;

-- The login method. `provider_id` is the user id for the email provider, and
-- (provider_id, provider) is the natural key. `email` is GENERATED from
-- identity_data, so it is not listed.
insert into auth.identities (
	id,
	user_id,
	provider_id,
	provider,
	identity_data,
	last_sign_in_at,
	created_at,
	updated_at
)
select
	gen_random_uuid(),
	s.id,
	s.id::text,
	'email',
	jsonb_build_object('sub', s.id::text, 'email', s.email, 'email_verified', true),
	now(),
	now(),
	now()
from seed_users s
on conflict (provider_id, provider) do nothing;

-- `handle_new_user` (see the profiles migration) already created a profile row
-- from raw_user_meta_data. This makes the display name deterministic even for
-- a user that survived a previous seed run.
insert into public.profiles (id, display_name)
select s.id, s.display_name
from seed_users s
on conflict (id) do update set display_name = excluded.display_name;

-- Add sample rows for your own tables below, following the same shape: fixed
-- ids, `on conflict do nothing`, no real data.

-- Two shared organizations on top of the personal orgs the signup trigger /
-- backfill created. Acme is the multi-member fixture; Globex exists so the
-- E2E user has an org they are deliberately NOT in (tenant-isolation checks).
-- Industries are spelled out for determinism: Acme keeps the 'general'
-- default, Globex is 'construction' so the two orgs draw from different
-- role sets (see the member_roles fixture below).
insert into public.organizations (id, name, tier_id, industry_id) values
	('10000000-0000-0000-0000-000000000001', 'Acme Inc', 'pro', 'general'),
	('10000000-0000-0000-0000-000000000002', 'Globex', 'free', 'construction')
on conflict (id) do nothing;

-- Memberships. `do update` keeps roles deterministic across re-seeds.
--   Acme:   dev = owner, evan = admin, e2e = member
--   Globex: evan = owner, dev = member, e2e absent on purpose
insert into public.organization_members (org_id, user_id, role) values
	('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member'),
	('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'member')
on conflict (org_id, user_id) do update set role = excluded.role;

-- CRM fixtures, all inside Acme so every seed user can see them (and Globex
-- stays empty for tenant-isolation checks). Ids use the 2000…/3000…/… ranges
-- per table family to stay greppable.
insert into public.clients (id, org_id, name, email, phone, company, website, status, created_by) values
	('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'Wayne Enterprises', 'hello@wayne.example.com', '+1 555 0100', 'Wayne Enterprises',
		'https://wayne.example.com', 'active', '00000000-0000-0000-0000-000000000001'),
	('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'Stark Industries', 'contact@stark.example.com', null, 'Stark Industries',
		null, 'lead', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.client_contacts (id, org_id, client_id, name, email, title, is_primary) values
	('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Lucius Fox', 'lucius@wayne.example.com', 'CEO', true),
	('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000002', 'Pepper Potts', 'pepper@stark.example.com', 'COO', true)
on conflict (id) do nothing;

insert into public.deals (id, org_id, client_id, title, amount, stage, assigned_to, created_by) values
	('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Annual support contract', 24000.00, 'proposal',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.tasks (id, org_id, client_id, title, due_at, assigned_to, created_by) values
	('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Send renewal quote', now() + interval '7 days',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.notes (id, org_id, client_id, author_id, body) values
	('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
		'Prefers email over phone. Renewal window opens in Q4.')
on conflict (id) do nothing;

insert into public.support_tickets (id, org_id, client_id, subject, description, status, priority, assigned_to, created_by) values
	('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Cannot export invoices',
		'Export button returns a 500 since the last update.', 'open', 'high',
		'00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.ticket_comments (id, org_id, ticket_id, author_id, body, is_internal) values
	('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
		'Reproduced on staging; looks like the PDF service credential expired.', true)
on conflict (id) do nothing;

insert into public.notifications (id, org_id, user_id, type, title, body, link) values
	('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000002', 'ticket_assigned', 'Ticket assigned to you',
		'Cannot export invoices (high priority)', '/tickets'),
	('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000001', 'task_assigned', 'New task from Evan Coppa',
		'Send renewal quote', '/tasks')
on conflict (id) do nothing;

-- Role assignments only — the roles themselves and their grants are
-- industry-scoped reference data shipped by the roles_permissions migration
-- (the b0000000-… ids). Each org's plain member gets its industry's
-- 'Support' role: same name, different grants per industry — the
-- cross-industry divergence fixture. Owners/admins hold implicit 'manage'
-- on everything and need no role.
--   Acme (general):        e2e holds general 'Support' (tickets manage, clients read)
--   Globex (construction): dev holds construction 'Support' (clients manage)
insert into public.member_roles (org_id, user_id, role_id) values
	('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0000-000000000001'),
	('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0000-000000000003')
on conflict (org_id, user_id, role_id) do nothing;

drop table seed_users;
