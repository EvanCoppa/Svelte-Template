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

insert into public.tasks (id, org_id, company_id, title, due_at, assigned_to, created_by) values
	('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001', 'Send renewal quote', now() + interval '7 days',
		'00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')
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

insert into public.custom_field_values (id, org_id, entity_type, entity_id, field_definition_id, value_text) values
	('a4000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
		'contact', '30000000-0000-0000-0000-000000000003',
		'a3000000-0000-0000-0000-000000000004', 'email')
on conflict (id) do nothing;

-- A deck is a reusable template, so this one carries slides and no proposal
-- data: a title slide with a runtime-bound heading, then the two slides the
-- presenter expands and fills from whichever proposal is being shown.
insert into public.slide_decks (id, org_id, name, deck_json, created_by, updated_by) values
	('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'Standard proposal deck',
		'{
			"version": 1,
			"slides": [
				{
					"id": "s1",
					"templateId": "title",
					"content": {
						"text": { "heading": "A proposal for you", "subheading": "Acme Inc" },
						"images": {},
						"colors": { "accentColor": "#2563eb" },
						"variables": { "heading": { "sourceField": "proposal.title" } }
					}
				},
				{
					"id": "s2",
					"templateId": "comparison-table",
					"content": {
						"text": { "heading": "Compare Your Options" },
						"images": {},
						"colors": { "accentColor": "#2563eb" }
					}
				},
				{
					"id": "s3",
					"templateId": "investment-summary",
					"content": {
						"text": { "heading": "Your Investment" },
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
		default_fee, tax_rate, valid_until, deck_id, created_by) values
	('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'Annual support contract — options',
		'{"seats": 120, "regions": ["us-east", "eu-west"]}', 'sent',
		250.00, 8.25, now() + interval '30 days',
		'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
	('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'company', '20000000-0000-0000-0000-000000000001', 'Website redesign',
		'{}', 'draft',
		null, null, null, null, '00000000-0000-0000-0000-000000000003')
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
