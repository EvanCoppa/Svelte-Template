-- Seed data for the LOCAL stack only.
--
-- Applied by `npm run db:reset`, after every migration in supabase/migrations.
-- It never runs against a hosted project, so the credentials below are fixed
-- and public on purpose: they exist so `npm run dev` and the Playwright suite
-- have a user to sign in as without anyone having to provision one by hand.
--
--   dev@example.com      / password123   ← sign in with this while developing
--   e2e@example.com      / password123   ← reserved for the E2E suite
--   evancoppa@gmail.com  / password123   ← same local password, not a real one;
--                                         the system admin (sees every org)
--   client@example.com   / password123   ← a PORTAL user: a client with a login,
--                                         not a member of any org (see below)
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
	display_name text not null,
	-- 'staff' signs up to USE the product and gets a personal organization;
	-- 'portal' is a client logging in to somebody else's, and gets none. The
	-- party-model migration's handle_new_user reads this from the signup
	-- metadata built below.
	account_type text not null default 'staff'
);

-- Add a row here to add a user. Everything below is generic.
insert into seed_users (id, email, password, display_name, account_type) values
	('00000000-0000-0000-0000-000000000001', 'dev@example.com', 'password123', 'Dev User', 'staff'),
	('00000000-0000-0000-0000-000000000002', 'e2e@example.com', 'password123', 'E2E Robot', 'staff'),
	('00000000-0000-0000-0000-000000000003', 'evancoppa@gmail.com', 'password123', 'Evan Coppa', 'staff'),
	('00000000-0000-0000-0000-000000000004', 'client@example.com', 'password123', 'Bruce Wayne', 'portal');

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
	jsonb_build_object('full_name', s.display_name, 'account_type', s.account_type),
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
-- Industries are spelled out for determinism: Acme keeps the 'crm'
-- default, Globex is 'roofing' so the two orgs draw from different role
-- sets (see the member_roles fixture below).
insert into public.organizations (id, name, tier_id, industry_id) values
	('10000000-0000-0000-0000-000000000001', 'Acme Inc', 'pro', 'crm'),
	('10000000-0000-0000-0000-000000000002', 'Globex', 'free', 'roofing')
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

-- Industry fixtures: two organizations in every industry the catalog ships
-- (industry_role_catalog migration), so each vertical's role ladder and
-- feature shape is exercisable after a reset. Evan owns one org per
-- industry and administers the other (dev owns that one); dev and e2e hold
-- the industry's roles as plain members, spread so every rung — Viewer, a
-- specialist, Manager — is held by someone somewhere. Tiers vary on
-- purpose so locked_visible shows up: a free org in an industry with deals
-- (Hooli, Harbor Health Supplies, Lakeside Brewing), a pro org in one with
-- best-practices (Lumen Cosmetics, Marigold Beverage Co). Every name sorts
-- after "Acme Inc", which keeps Acme the default active org for
-- e2e@example.com (tests/auth.spec.ts relies on it); Acme's own roster and
-- Globex's e2e-free membership are untouched.
insert into public.organizations (id, name, tier_id, industry_id) values
	('10000000-0000-0000-0000-000000000003', 'Initech', 'enterprise', 'crm'),
	('10000000-0000-0000-0000-000000000004', 'Hooli', 'free', 'crm'),
	('10000000-0000-0000-0000-000000000005', 'Ridgeline Roofing', 'pro', 'roofing'),
	('10000000-0000-0000-0000-000000000006', 'Northwind Roofing', 'enterprise', 'roofing'),
	('10000000-0000-0000-0000-000000000007', 'Meridian Medical Supply', 'pro', 'medical-supplies'),
	('10000000-0000-0000-0000-000000000008', 'Harbor Health Supplies', 'free', 'medical-supplies'),
	('10000000-0000-0000-0000-000000000009', 'Lumen Cosmetics', 'pro', 'cosmetic'),
	('10000000-0000-0000-0000-000000000010', 'Velvet & Vale Beauty', 'enterprise', 'cosmetic'),
	('10000000-0000-0000-0000-000000000011', 'Bright Smile Dental', 'enterprise', 'dentistry'),
	('10000000-0000-0000-0000-000000000012', 'Ashford Family Dentistry', 'pro', 'dentistry'),
	('10000000-0000-0000-0000-000000000013', 'Marigold Beverage Co', 'pro', 'beverage'),
	('10000000-0000-0000-0000-000000000014', 'Lakeside Brewing', 'free', 'beverage')
on conflict (id) do nothing;

-- Memberships: Evan owns the odd-numbered orgs and is admin of the
-- even-numbered ones, where dev is the owner; dev is a plain member of the
-- odd-numbered ones; e2e is a plain member wherever listed.
insert into public.organization_members (org_id, user_id, role) values
	-- Initech (crm)
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Hooli (crm)
	('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Ridgeline Roofing (roofing)
	('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Northwind Roofing (roofing)
	('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'admin'),
	-- Meridian Medical Supply (medical-supplies)
	('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Harbor Health Supplies (medical-supplies)
	('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Lumen Cosmetics (cosmetic)
	('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Velvet & Vale Beauty (cosmetic)
	('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Bright Smile Dental (dentistry)
	('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Ashford Family Dentistry (dentistry)
	('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Marigold Beverage Co (beverage)
	('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Lakeside Brewing (beverage)
	('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002', 'member')
on conflict (org_id, user_id) do update set role = excluded.role;

-- CRM fixtures, all inside Acme so every seed user can see them (and Globex
-- stays empty for tenant-isolation checks). Ids use the 2000…/3000…/… ranges
-- per table family to stay greppable.
insert into public.companies (id, org_id, name, email, phone, website, status, relationship, created_by) values
	('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'Wayne Enterprises', 'hello@wayne.example.com', '+1 555 0100',
		'https://wayne.example.com', 'active', 'customer', '00000000-0000-0000-0000-000000000001'),
	('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'Stark Industries', 'contact@stark.example.com', null,
		null, 'lead', 'customer', '00000000-0000-0000-0000-000000000003'),
	-- A supplier, so the relationship axis has more than one value in it.
	('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'Gotham Steel Supply', 'orders@gothamsteel.example.com', '+1 555 0180',
		null, 'active', 'supplier', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Two people at companies and one standing alone. The third is the whole point
-- of the party model: a customer who is a person, the shape a dental patient or
-- a homeowner takes, with no company row invented to hold them.
insert into public.contacts (id, org_id, company_id, name, email, title, is_primary, status, created_by) values
	('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Lucius Fox', 'lucius@wayne.example.com', 'CEO', true,
		'active', '00000000-0000-0000-0000-000000000001'),
	('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000002', 'Pepper Potts', 'pepper@stark.example.com', 'COO', true,
		'active', '00000000-0000-0000-0000-000000000001'),
	('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, 'Bruce Wayne', 'client@example.com', null, false,
		'active', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- The portal login: Bruce is a contact of Acme who can sign in as himself. He
-- is deliberately NOT an organization_member, so every existing policy already
-- shows him nothing — the link grants an identity, not access.
insert into public.contact_profiles (id, org_id, user_id, contact_id, invited_at) values
	('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', now())
on conflict (id) do nothing;

-- Addresses: a billing address on the company and a home address on the person
-- who has no company, which is exactly the case the old schema could not hold.
-- Coordinates are what a geocoder would have stored (src/lib/server/geocode.ts),
-- so the view pages' maps have pins with no provider configured.
insert into public.addresses (id, org_id, entity_type, entity_id, kind, line1, city, region, postal_code, country, latitude, longitude, is_primary) values
	('32000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'billing',
		'1007 Mountain Drive', 'Gotham', 'NJ', '07001', 'US', 40.580600, -74.285400, true),
	('32000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000003', 'primary',
		'1007 Mountain Drive', 'Gotham', 'NJ', '07001', 'US', 40.580600, -74.285400, true),
	-- The other two companies, so the Vendors view (Gotham Steel) and the
	-- companies map both have somewhere to point.
	('32000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000002', 'primary',
		'200 Park Avenue', 'New York', 'NY', '10166', 'US', 40.754500, -73.976000, true),
	('32000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000003', 'shipping',
		'1 Dock Road', 'Jersey City', 'NJ', '07305', 'US', 40.717800, -74.043100, true)
on conflict (id) do nothing;

-- A partner and the person at it, so the Partner contacts view lists someone.
insert into public.companies (id, org_id, name, email, phone, website, status, relationship, created_by) values
	('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'Oscorp', 'partners@oscorp.example.com', null,
		'https://oscorp.example.com', 'active', 'partner', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.contacts (id, org_id, company_id, name, email, title, is_primary, status, created_by) values
	('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000004', 'Norman Osborn', 'norman@oscorp.example.com', 'Chairman', true,
		'active', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- The stage is a row now, so the fixture looks it up by name in Acme's default
-- pipeline (created by the organizations trigger, see the pipelines migration)
-- rather than naming an enum value.
insert into public.deals (id, org_id, company_id, contact_id, title, amount, pipeline_id, stage_id, assigned_to, created_by)
select
	'40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
	'20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
	'Annual support contract', 24000.00, s.pipeline_id, s.id,
	'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
from public.pipeline_stages s
join public.pipelines p on p.id = s.pipeline_id and p.is_default
where p.org_id = '10000000-0000-0000-0000-000000000001' and s.name = 'Proposal'
on conflict (id) do nothing;

-- A deal for the standalone person, in the first stage, with no company at all.
insert into public.deals (id, org_id, contact_id, title, amount, assigned_to, created_by) values
	('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'30000000-0000-0000-0000-000000000003', 'Private security retainer', 8000.00,
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Tasks across the priority ladder and every column of the board, with the
-- due dates spread so the grouped list has a row in every bucket: one
-- overdue, one due today, two this week, one later, one with no date at all
-- and one already finished. `status` and `completed_at` are held in step by
-- trigger (the task board migration), so the done row's two agree rather than
-- one correcting the other — and the in-review row is the case that keeps
-- them honest: finished work with no finishing time, because it can come back.
insert into public.tasks (id, org_id, company_id, title, details, due_at, priority, status, completed_at, created_by) values
	('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Send renewal quote',
		'Pull last year''s numbers before quoting.', now() + interval '7 days',
		'high', 'todo', null, '00000000-0000-0000-0000-000000000003'),
	('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Chase the signed order form',
		null, now() + interval '2 days',
		'urgent', 'blocked', null, '00000000-0000-0000-0000-000000000001'),
	('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, 'Write the Q4 renewal playbook',
		'One page. What we say when they ask for a discount.', now() + interval '21 days',
		'low', 'in_progress', null, '00000000-0000-0000-0000-000000000003'),
	('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Book the kickoff call',
		null, now() - interval '3 days',
		'normal', 'done', now() - interval '2 days', '00000000-0000-0000-0000-000000000001'),
	-- Late, due today, and undated: the three buckets the four above do not reach.
	('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Confirm the site visit window',
		'Waiting on building access.', now() - interval '2 days',
		'urgent', 'in_progress', null, '00000000-0000-0000-0000-000000000003'),
	('50000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		null, 'Call the supplier back',
		null, date_trunc('day', now()) + interval '16 hours',
		'normal', 'todo', null, '00000000-0000-0000-0000-000000000001'),
	('50000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
		null, 'Tidy the proposal templates', null, null,
		'low', 'todo', null, '00000000-0000-0000-0000-000000000001'),
	-- Out of the doer's hands and waiting on a reader: the In review column.
	('50000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Draft the renewal terms',
		'With Evan for a read before it goes out.', now() + interval '4 days',
		'high', 'in_review', null, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Assignment is a relationship now, so a task can name more than one person:
-- the renewal quote is dev's and Evan's together, and the playbook was handed
-- from Evan to dev — the ended row is the history the old column could not
-- keep. `assigned_to` is the system type (relationships migration). Ids use
-- the f3… range here and f4… for the thread below; f1… and f2… are taken by
-- the assets block further down.
insert into public.relationships
	(id, org_id, relationship_type_id, from_type, from_id, to_type, to_id, started_on, ended_on, created_by) values
	('f3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'task', '50000000-0000-0000-0000-000000000001',
		'member', '00000000-0000-0000-0000-000000000001', current_date - 3, null,
		'00000000-0000-0000-0000-000000000003'),
	('f3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'task', '50000000-0000-0000-0000-000000000001',
		'member', '00000000-0000-0000-0000-000000000003', current_date - 3, null,
		'00000000-0000-0000-0000-000000000003'),
	('f3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'task', '50000000-0000-0000-0000-000000000002',
		'member', '00000000-0000-0000-0000-000000000001', current_date - 1, null,
		'00000000-0000-0000-0000-000000000001'),
	-- Handed over: Evan held it until yesterday, dev has it now.
	('f3000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'task', '50000000-0000-0000-0000-000000000003',
		'member', '00000000-0000-0000-0000-000000000003', current_date - 14, current_date - 1,
		'00000000-0000-0000-0000-000000000003'),
	('f3000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'task', '50000000-0000-0000-0000-000000000003',
		'member', '00000000-0000-0000-0000-000000000001', current_date - 1, null,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- A thread, so the task page has a conversation to render.
insert into public.task_comments (id, org_id, task_id, author_id, body, created_at) values
	('f4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003',
		'Last year they pushed back hard on the uplift. Worth leading with the usage numbers.',
		now() - interval '2 days'),
	('f4000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
		'Agreed. I''ll pull the seat count this afternoon and draft something.',
		now() - interval '2 days' + interval '20 minutes'),
	('f4000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003',
		'Draft looks right to me — send it once legal signs off on the term change.',
		now() - interval '6 hours')
on conflict (id) do nothing;

-- The interaction log that replaced `notes`: a note, a call and an email, so a
-- record timeline has something to render and every activity type is exercised.
insert into public.activities (id, org_id, entity_type, entity_id, type, direction, subject, body, occurred_at, duration_minutes, author_id) values
	('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'note', null, null,
		'Prefers email over phone. Renewal window opens in Q4.',
		now() - interval '9 days', null, '00000000-0000-0000-0000-000000000001'),
	('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000001', 'call', 'outbound',
		'Renewal check-in', 'Walked through the three options; Lucius wants the mid tier.',
		now() - interval '2 days', 18, '00000000-0000-0000-0000-000000000001'),
	('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'email', 'outbound',
		'Proposal sent', 'Sent the options deck and the investment summary.',
		now() - interval '1 day', null, '00000000-0000-0000-0000-000000000003'),
	-- An org-level note: no record at all, the shape `notes.client_id is null` had.
	('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		null, null, 'note', null, null,
		'Q4 pricing review scheduled for the first week of October.',
		now() - interval '5 days', null, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Sticky notes, the other half of "somebody wrote something down": documents
-- that stay open, not moments that happened (the notes migration explains the
-- split). One attached to a company, one to a deal, one loose, and one
-- archived — the four states the dock and /notes have to render.
insert into public.notes (id, org_id, entity_type, entity_id, title, body, color, archived_at, author_id) values
	('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'Renewal call prep',
		E'Ask about the second site.\nLucius wants the mid tier — hold the 12% discount back until he pushes.',
		'warning', null, '00000000-0000-0000-0000-000000000001'),
	('d0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', null,
		E'Procurement freeze lifts on the 14th. Nothing signs before then.',
		'info', null, '00000000-0000-0000-0000-000000000003'),
	('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, null, 'Scratch',
		E'wifi guest password: gotham-2026\nprinter is on the third floor',
		'cyan', null, '00000000-0000-0000-0000-000000000001'),
	('d0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		null, null, 'Old standup order',
		E'Dev, then E2E, then Evan. Superseded by the rota.',
		'neutral', now() - interval '3 days', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.support_tickets (id, org_id, company_id, contact_id, subject, description, status, priority, assigned_to, created_by) values
	('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Cannot export invoices',
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

-- Catalog fixtures: a two-level category tree, a stocked good and a service,
-- so the `kind` split and the inventory constraint both have a row. Prices are
-- what a proposal line item cites; the line keeps its own snapshot.
insert into public.product_categories (id, org_id, parent_id, name, sort_order) values
	('b1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		null, 'Materials', 10),
	('b1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'b1000000-0000-0000-0000-000000000001', 'Fixings', 10),
	('b1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, 'Services', 20)
on conflict (id) do nothing;

insert into public.products (id, org_id, category_id, kind, sku, name, description, unit_price,
		unit_cost, unit, track_inventory, quantity_on_hand, created_by) values
	('b2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'b1000000-0000-0000-0000-000000000002', 'good', 'FIX-SS-100',
		'Stainless fixing pack (100)', 'Marine-grade, for coastal installs.',
		42.50, 21.00, 'pack', true, 120, '00000000-0000-0000-0000-000000000001'),
	('b2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'b1000000-0000-0000-0000-000000000003', 'service', 'SVC-INSPECT',
		'Site inspection', 'A technician on site for up to two hours.',
		150.00, 60.00, 'visit', false, null, '00000000-0000-0000-0000-000000000001'),
	-- No SKU and no category: the everyday one-off line, proving both are optional.
	('b2000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, 'service', null, 'Consulting', null,
		200.00, null, 'hour', false, null, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Tags reuse the badge palette, so a tag and a status pill of the same tone are
-- the same hue. The taggings land on three different kinds of record, which is
-- the whole point of the shared entity link.
insert into public.tags (id, org_id, name, tone) values
	('b3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'VIP', 'violet'),
	('b3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Renewal', 'warning'),
	('b3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Coastal', 'cyan')
on conflict (id) do nothing;

insert into public.taggings (id, org_id, tag_id, entity_type, entity_id, created_by) values
	('b4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'b3000000-0000-0000-0000-000000000001', 'company', '20000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000001'),
	('b4000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'b3000000-0000-0000-0000-000000000001', 'contact', '30000000-0000-0000-0000-000000000003',
		'00000000-0000-0000-0000-000000000001'),
	('b4000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'b3000000-0000-0000-0000-000000000002', 'deal', '40000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000003'),
	('b4000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'b3000000-0000-0000-0000-000000000003', 'product', 'b2000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Role assignments only — the roles themselves and their grants are
-- industry-scoped reference data shipped by the roles_permissions migration
-- (the b0000000-… ids). Each org's plain member gets its industry's
-- 'Support' role: same name, different grants per industry — the
-- cross-industry divergence fixture. Owners/admins hold implicit 'manage'
-- on everything and need no role.
--   Acme (crm):       e2e holds crm 'Support' (tickets manage, companies/contacts read, library pages read)
--   Globex (roofing): dev holds roofing 'Support' (companies/contacts manage)
insert into public.member_roles (org_id, user_id, role_id) values
	('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0000-000000000001'),
	('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0000-000000000003')
on conflict (org_id, user_id, role_id) do nothing;

-- The industry orgs' assignments (ids follow the industry_role_catalog
-- migration's b0000000-0000-0000-00II-0000000000RR scheme: II = industry,
-- RR = role). One rung per plain member, except dev in Initech, who holds
-- two — the union fixture: Operations' manage on tasks plus Viewer's read
-- on everything else.
--   Initech (crm):                       dev = Viewer + Operations; e2e = Manager
--   Hooli (crm):                         e2e = Operations
--   Ridgeline Roofing (roofing):         dev = Crew Lead; e2e = Viewer
--   Meridian (medical-supplies):         dev = Sales Rep; e2e = Customer Service
--   Harbor Health (medical-supplies):    e2e = Viewer
--   Lumen Cosmetics (cosmetic):          dev = Account Executive; e2e = Studio Coordinator
--   Velvet & Vale (cosmetic):            e2e = Viewer
--   Bright Smile (dentistry):            dev = Hygienist; e2e = Front Desk
--   Ashford Family Dentistry (dentistry): e2e = Patient Support
--   Marigold Beverage (beverage):        dev = Route Sales Rep; e2e = Distribution Coordinator
--   Lakeside Brewing (beverage):         e2e = Viewer
insert into public.member_roles (org_id, user_id, role_id) values
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0001-000000000001'),
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0001-000000000002'),
	('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0001-000000000003'),
	('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0001-000000000002'),
	('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0002-000000000002'),
	('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0002-000000000001'),
	('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0003-000000000003'),
	('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0003-000000000002'),
	('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0003-000000000001'),
	('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0004-000000000003'),
	('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0004-000000000004'),
	('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0004-000000000001'),
	('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0005-000000000003'),
	('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0005-000000000002'),
	('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0005-000000000004'),
	('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0006-000000000002'),
	('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0006-000000000003'),
	('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0006-000000000001')
on conflict (org_id, user_id, role_id) do nothing;

-- Feature fixtures, one per escape hatch, so the seeded orgs show every mode
-- (the registry and its industry/tier maps ship by migration):
--   Acme (pro, crm):          tasks switched off by the org itself -> disabled;
--                             best-practices is enterprise-only     -> locked_visible
--   Globex (free, roofing):   deals is outside both its industry and its
--                             tier, an operator override enables it  -> a pilot;
--                             best-practices is not in roofing -> hidden
insert into public.organization_disabled_features (org_id, feature_id) values
	('10000000-0000-0000-0000-000000000001', 'tasks')
on conflict (org_id, feature_id) do nothing;

insert into public.organization_feature_overrides (org_id, feature_id, mode, note) values
	('10000000-0000-0000-0000-000000000002', 'deals', 'enabled', 'Pilot: deals outside the roofing catalog.')
on conflict (org_id, feature_id) do nothing;

-- A pending shareable-link invite into Acme with a fixed token, so the accept
-- flow (/invite/<token>) is exercisable straight after a reset. Personal
-- invites created from /staff get random database-generated tokens; a fixed
-- one is fine here because the local stack is disposable.
insert into public.organization_invites (id, org_id, email, token, invited_by) values
	('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		null, 'seed0000seed0000seed0000seed0000seed0000seed0000',
		'00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Proposal fixtures, inside Acme except the two drafts at the end of this
-- block. Ids use the a0…/a1…/… ranges per table family. Two proposals: one out for decision (sent, three options,
-- line items, custom values, a deck, a timeline) and one already accepted
-- with its execution record, so every table has a row after a reset.
-- computed_total is left out on purpose — the trigger owns it.
-- Definitions declare which kind of record they are for. The first three are
-- the proposal comparison rows; the fourth is the industry-specific attribute
-- on a PERSON that the generalized custom fields exist to make possible.
insert into public.custom_field_definitions (id, org_id, entity_type, key, label, value_type, allowed_values) values
	('a3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'warranty_years', 'Warranty (years)', 'numeric', null),
	('a3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'includes_onboarding', 'Onboarding included', 'boolean', null),
	('a3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'support_tier', 'Support tier', 'select', '["email", "business hours", "24/7"]'),
	('a3000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'contact', 'preferred_channel', 'Preferred channel', 'select', '["email", "phone", "text"]')
on conflict (id) do nothing;

-- The org's own field on its own list (the industry_custom_fields
-- migration): its flags put it on the Contacts table from the start, and
-- offer its three choices as a filter.
update public.custom_field_definitions set list_shown = true, list_filterable = true
where id = 'a3000000-0000-0000-0000-000000000004';

insert into public.custom_field_values (id, org_id, entity_type, entity_id, field_definition_id, value_text) values
	('a4000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000003',
		'a3000000-0000-0000-0000-000000000004', 'email')
on conflict (id) do nothing;

-- Acme's one deck — how its proposals are presented. It carries slides and
-- no proposal data: a cover whose heading is bound to the proposal at present
-- time, then the slides the presenter fills from whichever proposal is shown.
-- Every other org has no row and presents through the built-in default deck.
insert into public.slide_decks (id, org_id, deck_json, created_by, updated_by) values
	('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'{
			"version": 1,
			"slides": [
				{
					"id": "s1",
					"templateId": "cover",
					"content": {
						"text": { "heading": "A proposal for you", "subheading": "Acme Inc" },
						"images": {},
						"colors": { "accentColor": "#2563eb" },
						"variables": { "heading": { "sourceField": "proposal.title" } }
					}
				},
				{
					"id": "s2",
					"templateId": "option",
					"content": {
						"text": { "eyebrow": "Your options" },
						"images": {},
						"colors": { "accentColor": "#2563eb" }
					}
				},
				{
					"id": "s3",
					"templateId": "comparison",
					"content": {
						"text": { "heading": "Compare your options" },
						"images": {},
						"colors": { "accentColor": "#2563eb" }
					}
				},
				{
					"id": "s4",
					"templateId": "thank-you",
					"content": {
						"text": { "heading": "Thank you" },
						"images": {},
						"colors": { "accentColor": "#2563eb" }
					}
				}
			]
		}',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Proposal 1 hangs off the Wayne deal; proposal 2 off the Wayne company.
insert into public.proposals (id, org_id, entity_type, entity_id, title, base_config, status,
		default_fee, tax_rate, valid_until, created_by) values
	('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'Annual support contract — options',
		'{"seats": 120, "regions": ["us-east", "eu-west"]}', 'sent',
		250.00, 8.25, now() + interval '30 days',
		'00000000-0000-0000-0000-000000000001'),
	('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'Website redesign',
		'{}', 'draft',
		null, null, null, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.proposal_options (id, org_id, proposal_id, label, sort_order, is_recommended,
		base_price, fee_override, discount_amount, discount_pct, duration_value, duration_unit,
		start_offset_days, financing_available, financing_term_months, financing_apr, custom_fields) values
	('a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000001', 'Basic', 0, false,
		12000.00, null, 0, null, 12, 'months', 0, false, null, null, '{}'),
	('a2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000001', 'Standard', 1, true,
		24000.00, null, 0, 5, 12, 'months', 0, true, 12, 0, '{"sla_hours": 8}'),
	('a2000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000001', 'Premium', 2, false,
		30000.00, 0, 1000.00, null, 12, 'months', 0, true, 24, 4.99, '{"sla_hours": 1}'),
	('a2000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000002', 'Refresh', 0, false,
		8000.00, null, 0, null, 6, 'weeks', 14, false, null, null, '{}'),
	('a2000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000002', 'Rebuild', 1, true,
		18000.00, null, 0, null, 12, 'weeks', 14, true, 12, 0, '{}')
on conflict (id) do nothing;

insert into public.proposal_line_items (id, org_id, proposal_option_id, label, quantity, unit_cost, sort_order) values
	('a5000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000003', 'Dedicated engineer (days)', 10, 1200.00, 0),
	('a5000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000003', 'Quarterly review', 4, 500.00, 1)
on conflict (id) do nothing;

insert into public.custom_field_values (id, org_id, entity_type, entity_id, field_definition_id,
		value_text, value_numeric, value_boolean) values
	('a4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', null, 1, null),
	('a4000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', null, 2, null),
	('a4000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', null, 3, null),
	('a4000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', null, null, false),
	('a4000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', null, null, true),
	('a4000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000002', null, null, true),
	('a4000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'email', null, null),
	('a4000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', 'business hours', null, null),
	('a4000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
		'proposal_option', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000003', '24/7', null, null)
on conflict (id) do nothing;

-- One draft in a dental practice and one in a roofer, unattached, so the
-- industry's own words are visible straight after a reset: Bright Smile
-- presents "Treatment plans", Ridgeline sends "Quotes" (the proposals
-- feature migration). Evan owns both orgs.
insert into public.proposals (id, org_id, title, status, created_by) values
	('a1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000011',
		'Crown and whitening', 'draft', '00000000-0000-0000-0000-000000000003'),
	('a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005',
		'Re-roof, 32 squares', 'draft', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.proposal_options (id, org_id, proposal_id, label, sort_order, is_recommended, base_price) values
	('a2000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000011',
		'a1000000-0000-0000-0000-000000000003', 'Porcelain crown', 0, true, 1450.00),
	('a2000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005',
		'a1000000-0000-0000-0000-000000000004', 'Architectural shingle', 0, true, 18400.00)
on conflict (id) do nothing;

-- The accepted one: selection and status land together (the check
-- constraint wants both), then the follow-through. Idempotent by nature.
update public.proposals
set status = 'accepted', selected_option_id = 'a2000000-0000-0000-0000-000000000005'
where id = 'a1000000-0000-0000-0000-000000000002';

insert into public.proposal_events (id, org_id, proposal_id, event_type, proposal_option_id, actor, occurred_at, metadata) values
	('a7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000001', 'sent', null,
		'00000000-0000-0000-0000-000000000001', now() - interval '2 days', '{"channel": "email"}'),
	('a7000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000001', 'viewed', null,
		null, now() - interval '1 day', '{"user_agent": "seed"}'),
	('a7000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000002', 'accepted', 'a2000000-0000-0000-0000-000000000005',
		'00000000-0000-0000-0000-000000000003', now() - interval '3 days', '{}')
on conflict (id) do nothing;

insert into public.execution_records (id, org_id, proposal_id, proposal_option_id, execution_type, status, details, created_by) values
	('a8000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000005',
		'work_order', 'scheduled', '{"kickoff": "next sprint", "team": "web"}',
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- The two people every proposal names, from each org's own roster: Evan
-- presents Acme's (an admin there, dev owns) with dev responsible; Bright
-- Smile's and Ridgeline's are Evan's own, with dev the provider / project
-- manager. Nullable columns, so the update is what makes the fixtures whole.
update public.proposals p
set presenter_id = v.presenter_id, responsible_id = v.responsible_id
from (values
	('a1000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000003'::uuid,
		'00000000-0000-0000-0000-000000000001'::uuid),
	('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
		'00000000-0000-0000-0000-000000000001'),
	('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003',
		'00000000-0000-0000-0000-000000000001'),
	('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003',
		'00000000-0000-0000-0000-000000000001')
) as v (id, presenter_id, responsible_id)
where p.id = v.id;

-- Patients at Bright Smile, so the builder has someone to be for.
insert into public.contacts (id, org_id, company_id, name, email, phone, title, is_primary, status, created_by) values
	('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
		null, 'Dana Reyes', 'dana@example.com', '+1 555 010 0110', null, false,
		'active', '00000000-0000-0000-0000-000000000003'),
	('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011',
		null, 'Sam Ortiz', null, '+1 555 010 0111', null, false,
		'active', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Where the patients live, so Bright Smile's Patient map view opens on pins.
insert into public.addresses (id, org_id, entity_type, entity_id, kind, line1, city, region, postal_code, country, latitude, longitude, is_primary) values
	('32000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
		'contact', '30000000-0000-0000-0000-000000000011', 'primary',
		'418 Elm Street', 'Boulder', 'CO', '80302', 'US', 40.019000, -105.276500, true),
	('32000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011',
		'contact', '30000000-0000-0000-0000-000000000012', 'primary',
		'77 Pearl Street', 'Boulder', 'CO', '80302', 'US', 40.017900, -105.281800, true)
on conflict (id) do nothing;

-- Ridgeline Roofing's suppliers, so a roofer's Suppliers view has a list and a map.
insert into public.companies (id, org_id, name, email, phone, website, status, relationship, created_by) values
	('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000005',
		'Summit Shingle Co', 'sales@summitshingle.example.com', '+1 555 020 0500',
		null, 'active', 'supplier', '00000000-0000-0000-0000-000000000003'),
	('20000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000005',
		'Front Range Lumber', 'orders@frlumber.example.com', null,
		'https://frlumber.example.com', 'active', 'supplier', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.addresses (id, org_id, entity_type, entity_id, kind, line1, city, region, postal_code, country, latitude, longitude, is_primary) values
	('32000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000005',
		'company', '20000000-0000-0000-0000-000000000051', 'primary',
		'5200 Brighton Boulevard', 'Denver', 'CO', '80216', 'US', 39.783700, -104.973400, true),
	('32000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000005',
		'company', '20000000-0000-0000-0000-000000000052', 'primary',
		'1800 Foothills Parkway', 'Boulder', 'CO', '80301', 'US', 40.019800, -105.216500, true)
on conflict (id) do nothing;

-- The fee schedule (the billables migration): a dental practice's procedures
-- with their CDT codes, counted in teeth, quadrants or arches — and a
-- roofer's services, counted in squares. Featured ones are the builder's
-- checkboxes; the rest are found by search. Ids use the c1… range, bundles
-- c2….
insert into public.billables (id, org_id, code, name, unit_price, unit, unit_choices, is_featured, created_by) values
	-- Bright Smile Dental
	('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011',
		'D0120', 'Periodic exam', 65.00, 'visit', null, false, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000011',
		'D2740', 'Porcelain crown', 1450.00, 'tooth', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000011',
		'D4341', 'Scaling and root planing', 275.00, 'quadrant', '{UR,UL,BR,BL}', true,
		'00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000011',
		'D7140', 'Extraction', 250.00, 'tooth', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000011',
		'D9972', 'In-office whitening', 450.00, 'arch', '{Upper,Lower}', false,
		'00000000-0000-0000-0000-000000000003'),
	-- Ridgeline Roofing
	('c1000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000005',
		'RF-TEAROFF', 'Tear-off', 85.00, 'square', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000005',
		'RF-ARCH', 'Architectural shingle install', 425.00, 'square', null, true,
		'00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000005',
		'RF-UNDER', 'Ice and water underlayment', 95.00, 'square', null, false,
		'00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000005',
		'RF-SLOPE', 'Slope repair', 600.00, 'slope', '{Front,Back,Left,Right}', false,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.quick_plans (id, org_id, name, sort_order, created_by) values
	('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011',
		'Crown and whitening', 10, '00000000-0000-0000-0000-000000000003'),
	('c2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000011',
		'Hygiene visit', 20, '00000000-0000-0000-0000-000000000003'),
	('c2000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000005',
		'Full replacement', 10, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.quick_plan_billables (quick_plan_id, billable_id, org_id, sort_order) values
	('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
		'10000000-0000-0000-0000-000000000011', 0),
	('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
		'10000000-0000-0000-0000-000000000011', 1),
	('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
		'10000000-0000-0000-0000-000000000011', 0),
	('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003',
		'10000000-0000-0000-0000-000000000011', 1),
	('c2000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000011',
		'10000000-0000-0000-0000-000000000005', 0),
	('c2000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000013',
		'10000000-0000-0000-0000-000000000005', 1),
	('c2000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000012',
		'10000000-0000-0000-0000-000000000005', 2)
on conflict (quick_plan_id, billable_id) do nothing;

-- Bright Smile's draft is for Dana, and its option is built from the
-- schedule: two crowns (teeth 12 and 13) and an upper-arch whitening — the
-- fixture for `billable_id`, `detail` and a unit count.
update public.proposals
set entity_type = 'contact', entity_id = '30000000-0000-0000-0000-000000000011'
where id = 'a1000000-0000-0000-0000-000000000003';

insert into public.proposal_line_items (id, org_id, proposal_option_id, billable_id, label, quantity, unit_cost, detail, sort_order) values
	('a5000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
		'a2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000002',
		'Porcelain crown', 2, 1450.00, '12, 13', 0),
	('a5000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011',
		'a2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000005',
		'In-office whitening', 1, 450.00, 'Upper', 1)
on conflict (id) do nothing;

-- The platform operator (see the system_admins migration). Evan is the
-- developer's own account, so `npm run dev` lands in the operator view:
-- every org above in the switcher and owner-level access in each, whatever
-- the membership rows say. Sign in as dev@example.com or e2e@example.com to
-- see the app as a regular member; delete this row to see Evan as the plain
-- owner/admin/member the memberships make them.
insert into public.system_admins (user_id, note) values
	('00000000-0000-0000-0000-000000000003',
		'Seed fixture: the developer account operates every local org.')
on conflict (user_id) do nothing;

drop table seed_users;

-- One assistant thread for Acme's owner, stored in the AI SDK's UIMessage
-- shape exactly as the stream endpoint persists it, so the assistant page
-- opens with a conversation in its history rail straight after a reset.
insert into public.assistant_conversations (id, org_id, user_id, title) values
	('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000001', 'Which companies are still leads')
on conflict (id) do nothing;

insert into public.assistant_messages (conversation_id, id, role, position, parts, metadata) values
	('c0000000-0000-0000-0000-000000000001', 'seed-user-000000000001', 'user', 0,
		'[{"type": "text", "text": "Which of our companies are still leads?"}]'::jsonb,
		'{"createdAt": 1757155200000}'::jsonb),
	('c0000000-0000-0000-0000-000000000001', 'seed-assistant-00000001', 'assistant', 1,
		'[{"type": "step-start"}, {"type": "text", "text": "One company is still a lead: **Stark Industries**. Wayne Enterprises is already active."}]'::jsonb,
		'{"createdAt": 1757155203000, "model": "claude-opus-5"}'::jsonb)
on conflict (conversation_id, id) do nothing;

-- The calendar: a week of appointments, visits and demos around today, so a
-- reset always lands on a populated schedule (the calendar migration explains
-- why an event is neither an activity nor a task). Offsets are from the Monday
-- of the current week in the fixtures' wall-clock zone below — one line to
-- move them into yours. Ends are exclusive, and the all-day offsite runs from
-- midnight to midnight, the way the app writes one.
insert into public.calendar_events (id, org_id, entity_type, entity_id, title, description, location,
	starts_at, ends_at, all_day, color, assigned_to, created_by)
select
	e.id, e.org_id, e.entity_type, e.entity_id, e.title, e.description, e.location,
	week.monday + e.starts, week.monday + e.ends, e.all_day, e.color, e.assigned_to, e.created_by
from (
	select date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York' as monday
) as week
cross join (values
	('e1000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid,
		null::public.crm_entity_type, null::uuid, 'Team stand-up', 'Yesterday, today, blockers.', 'Huddle room',
		interval '9 hours', interval '9 hours 30 minutes', false, 'indigo'::public.badge_tone,
		'00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid),
	('e1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000001', 'Renewal review with Lucius',
		'Walk through the three options; he leans mid tier.', 'Video call',
		interval '1 day 10 hours', interval '1 day 11 hours', false, 'info',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
	('e1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'Wayne Enterprises site visit',
		'Second site walkthrough with facilities.', '1007 Mountain Drive, Gotham',
		interval '1 day 14 hours', interval '1 day 15 hours 30 minutes', false, 'violet',
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
	('e1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000002', 'Stark Industries intro call',
		'Pepper is bringing procurement.', 'Video call',
		interval '2 days 11 hours', interval '2 days 12 hours', false, 'cyan',
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
	('e1000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		null, null, 'Q4 planning offsite', 'Pricing review, then the roadmap.', 'The Lakehouse',
		interval '3 days', interval '4 days', true, 'warning',
		null, '00000000-0000-0000-0000-000000000003'),
	('e1000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'Deal desk: Wayne renewal',
		'Sign-off on the discount ceiling before the proposal goes out.', null,
		interval '3 days 9 hours 30 minutes', interval '3 days 10 hours', false, 'success',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
	('e1000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'Proposal walkthrough',
		'Present the options deck; leave the investment summary behind.', 'Wayne Tower, floor 40',
		interval '4 days 15 hours', interval '4 days 16 hours', false, 'rose',
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
	('e1000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
		null, null, 'Team stand-up', 'Yesterday, today, blockers.', 'Huddle room',
		interval '7 days 9 hours', interval '7 days 9 hours 30 minutes', false, 'indigo',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
	-- Two appointments overlap on Tuesday morning, so the week view has a
	-- side-by-side layout to draw after a reset.
	('e1000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000002', 'Coffee with Pepper',
		null, 'Blue Bottle, 5th Ave',
		interval '1 day 10 hours 30 minutes', interval '1 day 11 hours 30 minutes', false, 'orange',
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
	-- A practice's "Schedule": the same table, named by the industry.
	('e1000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
		'contact', '30000000-0000-0000-0000-000000000011', 'Dana Reyes — crown prep',
		'Teeth 12 and 13; review the treatment plan first.', 'Operatory 2',
		interval '1 day 9 hours', interval '1 day 10 hours 30 minutes', false, 'info',
		'00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003')
) as e (id, org_id, entity_type, entity_id, title, description, location,
	starts, ends, all_day, color, assigned_to, created_by)
on conflict (id) do nothing;

-- The register and the graph (the assets and relationships migrations), all
-- inside Acme. Three assets — a laptop, a truck and the compressor that
-- rides in it — and the relationships that say who holds what: the org's
-- own employee (a 'member' endpoint, dev) has the laptop, Wayne owns the
-- truck the org services, the truck was bought from the steel supplier, and
-- Lucius Fox once worked at Stark before Wayne (an ENDED row beside the open
-- one — the history the partial unique index allows). Ids use the f1… range
-- for assets and f2… for relationships; the types are the system ones from
-- the migration (f0…).
insert into public.assets (id, org_id, name, asset_type, identifier, status, acquired_on, purchase_price, created_by) values
	('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'MacBook Pro 16"', 'device', 'IT-001', 'active', '2026-01-15', 2399.00,
		'00000000-0000-0000-0000-000000000001'),
	('f1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'Box truck', 'vehicle', 'FL-01', 'active', '2024-06-01', 48500.00,
		'00000000-0000-0000-0000-000000000001'),
	('f1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'Air compressor', 'equipment', 'EQ-014', 'inactive', '2024-06-01', 1250.00,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Marigold Beverage's assets are out in the field. The beverage industry ships
-- the Location and Serial number fields (the industry_custom_fields migration),
-- so the org's definitions already exist by the time this runs — the values
-- below look them up by key rather than naming an id.
insert into public.assets (id, org_id, name, asset_type, identifier, status, acquired_on, purchase_price, created_by) values
	('f1000000-0000-0000-0013-000000000001', '10000000-0000-0000-0000-000000000013',
		'Draft tower, 4-tap', 'tap', 'TAP-0041', 'active', '2025-03-10', 1850.00,
		'00000000-0000-0000-0000-000000000003'),
	('f1000000-0000-0000-0013-000000000002', '10000000-0000-0000-0000-000000000013',
		'Glass-door cooler', 'cooler', 'CLR-0107', 'active', '2025-05-22', 2400.00,
		'00000000-0000-0000-0000-000000000003'),
	('f1000000-0000-0000-0013-000000000003', '10000000-0000-0000-0000-000000000013',
		'Half-barrel keg', 'keg', 'KEG-2210', 'inactive', '2024-11-02', 160.00,
		'00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.custom_field_values (org_id, entity_type, entity_id, field_definition_id, value_text) values
	('10000000-0000-0000-0000-000000000013', 'asset', 'f1000000-0000-0000-0013-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000013' and entity_type = 'asset' and key = 'location'), 'Route 1'),
	('10000000-0000-0000-0000-000000000013', 'asset', 'f1000000-0000-0000-0013-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000013' and entity_type = 'asset' and key = 'serial_number'), 'MB-TT4-88213'),
	('10000000-0000-0000-0000-000000000013', 'asset', 'f1000000-0000-0000-0013-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000013' and entity_type = 'asset' and key = 'location'), 'Route 2'),
	('10000000-0000-0000-0000-000000000013', 'asset', 'f1000000-0000-0000-0013-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000013' and entity_type = 'asset' and key = 'serial_number'), 'GD-C-5510'),
	('10000000-0000-0000-0000-000000000013', 'asset', 'f1000000-0000-0000-0013-000000000003',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000013' and entity_type = 'asset' and key = 'location'), 'Warehouse')
on conflict (entity_type, entity_id, field_definition_id) do nothing;

insert into public.relationships (id, org_id, relationship_type_id, from_type, from_id, to_type, to_id, started_on, ended_on, notes, created_by) values
	-- The laptop is assigned to dev, who works here.
	('f2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000012', 'asset', 'f1000000-0000-0000-0000-000000000001',
		'member', '00000000-0000-0000-0000-000000000001', '2026-01-15', null, null,
		'00000000-0000-0000-0000-000000000001'),
	-- Wayne Enterprises owns the truck; it was bought from Gotham Steel Supply.
	('f2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000011', 'company', '20000000-0000-0000-0000-000000000001',
		'asset', 'f1000000-0000-0000-0000-000000000002', '2024-06-01', null, null,
		'00000000-0000-0000-0000-000000000001'),
	('f2000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000014', 'asset', 'f1000000-0000-0000-0000-000000000002',
		'company', '20000000-0000-0000-0000-000000000003', '2024-06-01', null, 'Invoice GS-2291',
		'00000000-0000-0000-0000-000000000001'),
	-- The compressor is part of the truck's kit.
	('f2000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000016', 'asset', 'f1000000-0000-0000-0000-000000000003',
		'asset', 'f1000000-0000-0000-0000-000000000002', null, null, null,
		'00000000-0000-0000-0000-000000000001'),
	-- Lucius worked at Stark before Wayne (his contacts.company_id): the ended
	-- period is history the column cannot hold, and the reason the graph exists
	-- beside it.
	('f2000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000001', 'contact', '30000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000002', '2012-03-01', '2019-08-31', null,
		'00000000-0000-0000-0000-000000000001'),
	-- Pepper referred Lucius.
	('f2000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		'f0000000-0000-0000-0000-000000000004', 'contact', '30000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000002', null, null, null,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- The ledger: what Acme is owed and what has come in (the invoicing and
-- ledger migrations). Numbers are left to the trigger, so a fresh reset
-- reads INV-00001 onwards in insert order and a new invoice never collides
-- with a seeded one. Five documents cover every state the two pages draw —
-- issued and overdue with a part payment, issued and settled, issued to a
-- PERSON with no company at all (the reason the ledger migration made the
-- customer a party), void, and a draft still being written — and the
-- payments below leave one sum unapplied, sitting on that person's account.
--
-- Every invoice goes in as a draft and is moved to its real status after its
-- lines: the trigger that freezes an issued invoice refuses a line on
-- anything but a draft, and a seed is no exception to it.
insert into public.invoices (id, org_id, company_id, contact_id, payment_terms_days, due_date,
		billing_email, memo, created_by) values
	-- Net-30, issued 40 days ago: overdue, with $1,000 of it paid.
	('e5000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		30, current_date - 10, 'ap@wayne.example.com', 'Site work, August.',
		'00000000-0000-0000-0000-000000000001'),
	-- Settled in full by card three days after it went out.
	('e5000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
		15, current_date + 10, null, null,
		'00000000-0000-0000-0000-000000000001'),
	-- A bill to a person: no company anywhere on it.
	('e5000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, '30000000-0000-0000-0000-000000000003',
		30, current_date + 18, 'client@example.com', 'Retainer, September.',
		'00000000-0000-0000-0000-000000000003'),
	-- Issued by mistake and voided the same day; stays in the record.
	('e5000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000002', null,
		15, current_date + 5, null, 'Duplicate of the September bill.',
		'00000000-0000-0000-0000-000000000001'),
	-- Still a draft: lines can change, nothing is owed yet, not on the ledger.
	('e5000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', null,
		30, null, null, null,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Lines cite the catalog where they came from and keep their own price; the
-- header's subtotal and tax roll up from them by trigger.
insert into public.invoice_line_items (id, org_id, invoice_id, product_id, description,
		product_sku_snapshot, quantity, unit_price, discount, tax, sort_order) values
	('e6000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002',
		'Site inspection', 'SVC-INSPECT', 2, 150.00, 0, 24.75, 0),
	('e6000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003',
		'Consulting', null, 8, 200.00, 100.00, 123.75, 1),
	('e6000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001',
		'Stainless fixing pack (100)', 'FIX-SS-100', 4, 42.50, 0, 14.03, 0),
	('e6000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000003',
		'Consulting — retainer', null, 20, 200.00, 0, 0, 0),
	('e6000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000001',
		'Stainless fixing pack (100)', 'FIX-SS-100', 4, 42.50, 0, 14.03, 0),
	('e6000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000002',
		'Site inspection', 'SVC-INSPECT', 1, 150.00, 0, 12.38, 0)
on conflict (id) do nothing;

-- Now the lifecycle. Idempotent: a re-run restates the same values.
update public.invoices set status = 'issued', issued_at = now() - interval '40 days'
	where id = 'e5000000-0000-0000-0000-000000000001';
update public.invoices set status = 'issued', issued_at = now() - interval '5 days'
	where id = 'e5000000-0000-0000-0000-000000000002';
update public.invoices set status = 'issued', issued_at = now() - interval '12 days'
	where id = 'e5000000-0000-0000-0000-000000000003';
update public.invoices
	set status = 'void', issued_at = now() - interval '9 days', voided_at = now() - interval '9 days'
	where id = 'e5000000-0000-0000-0000-000000000004';

-- Money that moved. The first two settle an invoice (the rollup marks one
-- partial and the other paid); the third is a deposit from the person with
-- no company, applied to nothing yet — the ledger shows it as credit on
-- their account until someone puts it against a bill.
insert into public.payments (id, org_id, company_id, contact_id, invoice_id, kind, method, amount,
		reference, received_at, notes, created_by) values
	('e7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'e5000000-0000-0000-0000-000000000001', 'payment', 'check', 1000.00,
		'4471', now() - interval '20 days', 'Part payment; balance promised end of month.',
		'00000000-0000-0000-0000-000000000001'),
	('e7000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
		'e5000000-0000-0000-0000-000000000002', 'payment', 'card', 184.03,
		'auth 88Q1', now() - interval '2 days', null,
		'00000000-0000-0000-0000-000000000001'),
	('e7000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		null, '30000000-0000-0000-0000-000000000003',
		null, 'payment', 'cash', 500.00,
		null, now() - interval '8 days', 'Deposit taken at the desk.',
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Merchant services: two orgs in the payment-processor vertical
-- ---------------------------------------------------------------------------
-- The merchant_services_industry migration is config only, so this is where
-- the vertical becomes something you can look at: a pro org with a book, and
-- a free one so the tier axis has a fixture here too (on `free`, Applications,
-- Equipment and the Assistant resolve `locked_visible` — an upgrade tease
-- rather than a missing page).
--
-- Keystone is the odd-numbered org, so Evan owns it and dev is a plain member,
-- matching every other industry pair above.

insert into public.organizations (id, name, tier_id, industry_id) values
	('10000000-0000-0000-0000-000000000015', 'Keystone Payments', 'pro', 'merchant-services'),
	('10000000-0000-0000-0000-000000000016', 'Cobalt Merchant Services', 'free', 'merchant-services')
on conflict (id) do nothing;

insert into public.organization_members (org_id, user_id, role) values
	-- Keystone Payments (merchant-services)
	('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000003', 'owner'),
	('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'member'),
	('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000002', 'member'),
	-- Cobalt Merchant Services (merchant-services)
	('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001', 'owner'),
	('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000003', 'admin'),
	('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000002', 'member')
on conflict (org_id, user_id) do nothing;

--   Keystone Payments:         dev = Sales Rep; e2e = Merchant Support
--   Cobalt Merchant Services:  e2e = Viewer
-- Sales Rep is the interesting one to sign in as: it manages merchants,
-- applications and rate proposals but only reads the fee schedule, so
-- /billables opens read-only and its "Add fee" button is not rendered.
insert into public.member_roles (org_id, user_id, role_id) values
	('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001',
		'b0000000-0000-0000-0007-000000000002'),
	('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0007-000000000003'),
	('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000002',
		'b0000000-0000-0000-0007-000000000001')
on conflict (org_id, user_id, role_id) do nothing;

-- The boarding funnel — the ten stages a real ISO named in its build brief
-- (docs/discovery/gsp-brief-gap-analysis.md), not a funnel we invented. Every
-- org is born with the generic "Sales" board (`create_default_pipeline`,
-- called by a trigger), which is the wrong six words for this vertical, so
-- the board is renamed and its stages replaced with the walk from a cold call
-- to a merchant's first batch. This is the point of pipelines being rows: the
-- funnel is data, and it is the customer's — but it is per-ORG data, which is
-- why it lives here rather than in the industry's migration, and why a real
-- org onboarded tomorrow still starts on the generic board.
update public.pipelines
set name = 'Merchant boarding',
	description = 'Cold lead to first batch.'
where org_id in ('10000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000016')
	and is_default;

--
-- An UPSERT, not an insert: the trigger's board already contains 'Lost', so
-- conflict-skipping would leave it wherever the generic board put it — at 60,
-- colliding with 'Approved'. The stage's position and outcome are what this
-- fixture is asserting, so they are what the conflict updates.
insert into public.pipeline_stages (org_id, pipeline_id, name, sort_order, outcome, probability)
select p.org_id, p.id, s.name, s.sort_order, s.outcome::public.stage_outcome, s.probability
from (values
	('10000000-0000-0000-0000-000000000015'::uuid), ('10000000-0000-0000-0000-000000000016')
) as o (org_id)
join public.pipelines p on p.org_id = o.org_id and p.is_default
cross join (values
	('Prospect', 10, 'open', 5),
	('Contacted', 20, 'open', 10),
	('Waiting on Statements', 30, 'open', 20),
	('Presentation Scheduled', 40, 'open', 35),
	('Proposal Sent', 50, 'open', 50),
	('Application Sent', 60, 'open', 70),
	('Underwriting', 70, 'open', 80),
	('Approved', 80, 'open', 90),
	('Installed / Live', 90, 'won', 100),
	('Lost', 100, 'lost', 0)
) as s (name, sort_order, outcome, probability)
on conflict (pipeline_id, name) do update
	set sort_order = excluded.sort_order,
		outcome = excluded.outcome,
		probability = excluded.probability;

-- The six stages the trigger made, now that the ten above have replaced
-- them. Guarded on nothing referencing them, so a re-run (where the deals
-- below already point at the new stages) deletes nothing and errors on
-- nothing.
delete from public.pipeline_stages s
where s.org_id in ('10000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000016')
	and s.name not in ('Prospect', 'Contacted', 'Waiting on Statements',
		'Presentation Scheduled', 'Proposal Sent', 'Application Sent', 'Underwriting',
		'Approved', 'Installed / Live', 'Lost')
	and not exists (select 1 from public.deals d where d.stage_id = s.id);

-- MID, MCC, average ticket and current processor — the four things a rep
-- looks up about a merchant — are the industry's custom fields on `company`
-- (the industry_custom_fields migration): both orgs received them when they
-- were inserted above, so the values below look each field up by key.
--
-- `mid` holds ONE value, which is honest only while a merchant has one MID —
-- a business with three locations wants merchant accounts as a record kind
-- of their own.

-- The book. Deliberately unalike — a smoothie bar, a liquor store, a barber,
-- a dental group — because "any business that takes money" is the whole
-- proposition, and a bank that sends referrals is a `partner`, which is what
-- the Referral partners view reads.
insert into public.companies (id, org_id, name, email, phone, website, status, relationship, created_by) values
	('20000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'Sunrise Smoothie Bar', 'maya@sunrisesmoothie.example.com', '+1 555 030 0101',
		'https://sunrisesmoothie.example.com', 'active', 'customer', '00000000-0000-0000-0000-000000000003'),
	('20000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'Harbor Liquor & Fine Wine', 'orders@harborliquor.example.com', '+1 555 030 0102',
		null, 'active', 'customer', '00000000-0000-0000-0000-000000000003'),
	('20000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015',
		'Cedar Street Barbers', 'hello@cedarbarbers.example.com', '+1 555 030 0103',
		null, 'prospect', 'customer', '00000000-0000-0000-0000-000000000001'),
	('20000000-0000-0000-0007-000000000004', '10000000-0000-0000-0000-000000000015',
		'Ironwood Dental Group', 'office@ironwooddental.example.com', null,
		null, 'lead', 'customer', '00000000-0000-0000-0000-000000000001'),
	('20000000-0000-0000-0007-000000000005', '10000000-0000-0000-0000-000000000015',
		'Gulfshore Community Bank', 'referrals@gulfshorebank.example.com', '+1 555 030 0105',
		'https://gulfshorebank.example.com', 'active', 'partner', '00000000-0000-0000-0000-000000000003'),
	('20000000-0000-0000-0007-000000000006', '10000000-0000-0000-0000-000000000016',
		'Lakefront Deli', 'deli@lakefront.example.com', '+1 555 030 0106',
		null, 'active', 'customer', '00000000-0000-0000-0000-000000000001'),
	('20000000-0000-0000-0007-000000000007', '10000000-0000-0000-0000-000000000016',
		'Northgate Auto Spa', null, '+1 555 030 0107',
		null, 'lead', 'customer', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Two boarded merchants carry all four fields; the prospect carries only the
-- processor it is being taken from, because it has no MID yet. That asymmetry
-- is the fixture: it is what the top of the funnel actually looks like.
insert into public.custom_field_values (org_id, entity_type, entity_id, field_definition_id, value_text, value_numeric)
values
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'mid'), '519000012345678', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'mcc'), '5812', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'average_ticket'), null, 9.40),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000001',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'current_processor'), 'Square', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'mid'), '519000098765432', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'mcc'), '5921', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'average_ticket'), null, 42.15),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000002',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'current_processor'), 'Heartland', null),
	('10000000-0000-0000-0000-000000000015', 'company', '20000000-0000-0000-0007-000000000003',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000015' and entity_type = 'company' and key = 'current_processor'), 'Toast', null),
	('10000000-0000-0000-0000-000000000016', 'company', '20000000-0000-0000-0007-000000000006',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000016' and entity_type = 'company' and key = 'mid'), '442000011223344', null),
	('10000000-0000-0000-0000-000000000016', 'company', '20000000-0000-0000-0007-000000000006',
		(select id from public.custom_field_definitions where org_id = '10000000-0000-0000-0000-000000000016' and entity_type = 'company' and key = 'average_ticket'), null, 16.80)
on conflict (entity_type, entity_id, field_definition_id) do nothing;

-- Where they are, so the Merchant map opens on pins rather than an empty map
-- (the same shape Bright Smile's patient map uses).
insert into public.addresses (id, org_id, entity_type, entity_id, kind, line1, city, region, postal_code, country, latitude, longitude, is_primary) values
	('32000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015', 'company',
		'20000000-0000-0000-0007-000000000001', 'primary', '418 Bayshore Blvd', 'Tampa', 'FL', '33606', 'US', 27.9284, -82.4847, true),
	('32000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015', 'company',
		'20000000-0000-0000-0007-000000000002', 'primary', '1207 E 7th Ave', 'Tampa', 'FL', '33605', 'US', 27.9601, -82.4407, true),
	('32000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015', 'company',
		'20000000-0000-0000-0007-000000000003', 'primary', '3310 S Dale Mabry Hwy', 'Tampa', 'FL', '33629', 'US', 27.9126, -82.5062, true),
	('32000000-0000-0000-0007-000000000004', '10000000-0000-0000-0000-000000000015', 'company',
		'20000000-0000-0000-0007-000000000004', 'primary', '705 W Kennedy Blvd', 'Tampa', 'FL', '33606', 'US', 27.9450, -82.4703, true),
	('32000000-0000-0000-0007-000000000005', '10000000-0000-0000-0000-000000000015', 'company',
		'20000000-0000-0000-0007-000000000005', 'primary', '100 N Ashley Dr', 'Tampa', 'FL', '33602', 'US', 27.9481, -82.4590, true)
on conflict (id) do nothing;

insert into public.contacts (id, org_id, company_id, name, email, phone, title, is_primary, status, created_by) values
	('30000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'20000000-0000-0000-0007-000000000001', 'Maya Ortiz', 'maya@sunrisesmoothie.example.com',
		'+1 555 030 0201', 'Owner', true, 'active', '00000000-0000-0000-0000-000000000003'),
	('30000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'20000000-0000-0000-0007-000000000002', 'Dev Rao', 'dev@harborliquor.example.com',
		'+1 555 030 0202', 'Owner', true, 'active', '00000000-0000-0000-0000-000000000003'),
	('30000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015',
		'20000000-0000-0000-0007-000000000005', 'Rachel Kim', 'rachel.kim@gulfshorebank.example.com',
		null, 'VP, Business Banking', true, 'active', '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- The fee schedule. Every row here is a FIXED price per unit, which is what
-- `billables.unit_price` holds — so the monthly, per-item and incident fees
-- fit exactly. The discount rate itself (25 basis points over interchange)
-- does NOT: it is a percentage of volume, and there is no column for that.
-- A rate proposal built from these prices is therefore the fixed half of the
-- quote today, which is worth knowing before it is demoed.
insert into public.billables (id, org_id, code, name, unit_price, unit, unit_choices, is_featured, created_by) values
	('c1000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'AUTH', 'Authorization fee', 0.10, 'transaction', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'STMT', 'Monthly service fee', 9.95, 'month', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015',
		'PCI', 'PCI compliance', 99.00, 'year', null, true, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0007-000000000004', '10000000-0000-0000-0000-000000000015',
		'GTWY', 'Gateway access', 14.95, 'month', null, false, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0007-000000000005', '10000000-0000-0000-0000-000000000015',
		'CHGB', 'Chargeback fee', 25.00, 'chargeback', null, false, '00000000-0000-0000-0000-000000000003'),
	('c1000000-0000-0000-0007-000000000006', '10000000-0000-0000-0000-000000000015',
		'BATCH', 'Batch settlement', 0.15, 'batch', null, false, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- "Quick options": the bundles a rep picks from instead of assembling a
-- proposal fee by fee.
insert into public.quick_plans (id, org_id, name, sort_order, created_by) values
	('c2000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'Retail — interchange plus', 10, '00000000-0000-0000-0000-000000000003'),
	('c2000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'E-commerce — gateway included', 20, '00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.quick_plan_billables (quick_plan_id, billable_id, org_id, sort_order) values
	('c2000000-0000-0000-0007-000000000001', 'c1000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015', 10),
	('c2000000-0000-0000-0007-000000000001', 'c1000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015', 20),
	('c2000000-0000-0000-0007-000000000001', 'c1000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015', 30),
	('c2000000-0000-0000-0007-000000000001', 'c1000000-0000-0000-0007-000000000006', '10000000-0000-0000-0000-000000000015', 40),
	('c2000000-0000-0000-0007-000000000002', 'c1000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015', 10),
	('c2000000-0000-0000-0007-000000000002', 'c1000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015', 20),
	('c2000000-0000-0000-0007-000000000002', 'c1000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000015', 30),
	('c2000000-0000-0000-0007-000000000002', 'c1000000-0000-0000-0007-000000000004', '10000000-0000-0000-0000-000000000015', 40),
	('c2000000-0000-0000-0007-000000000002', 'c1000000-0000-0000-0007-000000000005', '10000000-0000-0000-0000-000000000015', 50)
on conflict (quick_plan_id, billable_id) do nothing;

-- Two applications in flight, at different stages of the board above.
insert into public.deals (id, org_id, company_id, contact_id, title, amount, pipeline_id, stage_id, assigned_to, created_by)
select
	d.id::uuid, d.org_id::uuid, d.company_id::uuid, d.contact_id::uuid, d.title, d.amount::numeric,
	p.id, s.id, d.assigned_to::uuid, d.created_by::uuid
from (values
	('40000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'20000000-0000-0000-0007-000000000001', '30000000-0000-0000-0007-000000000001',
		'Sunrise Smoothie Bar — retail IC+', 1800.00, 'Underwriting',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
	('40000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'20000000-0000-0000-0007-000000000003', null,
		'Cedar Street Barbers — flat rate', 640.00, 'Proposal Sent',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
) as d (id, org_id, company_id, contact_id, title, amount, stage_name, assigned_to, created_by)
join public.pipelines p on p.org_id = d.org_id::uuid and p.is_default
join public.pipeline_stages s on s.pipeline_id = p.id and s.name = d.stage_name
on conflict (id) do nothing;

-- Terminals: the specific unit on a specific counter. What it IS lives here;
-- where it is is a relationship, never a column on the asset (the assets
-- migration's rule).
insert into public.assets (id, org_id, name, asset_type, identifier, status, acquired_on, purchase_price, created_by) values
	('f1000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'PAX A920 Pro', 'terminal', 'SN-A920-44817', 'active', current_date - 90, 299.00,
		'00000000-0000-0000-0000-000000000003'),
	('f1000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'Dejavoo QD3', 'terminal', 'SN-QD3-10229', 'active', current_date - 30, 219.00,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.relationships (id, org_id, relationship_type_id, from_type, from_id, to_type, to_id, started_on, created_by) values
	('f4000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000015',
		'f0000000-0000-0000-0000-000000000018', 'asset', 'f1000000-0000-0000-0007-000000000001',
		'company', '20000000-0000-0000-0007-000000000001', current_date - 88,
		'00000000-0000-0000-0000-000000000003'),
	('f4000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000015',
		'f0000000-0000-0000-0000-000000000018', 'asset', 'f1000000-0000-0000-0007-000000000002',
		'company', '20000000-0000-0000-0007-000000000002', current_date - 28,
		'00000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;
