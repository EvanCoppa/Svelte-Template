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
--   Acme (crm):       e2e holds crm 'Support' (tickets manage, clients read, library pages read)
--   Globex (roofing): dev holds roofing 'Support' (clients manage)
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

-- Proposal fixtures, all inside Acme. Ids use the a0…/a1…/… ranges per
-- table family. Two proposals: one out for decision (sent, three options,
-- line items, custom values, a deck, a timeline) and one already accepted
-- with its execution record, so every table has a row after a reset.
-- computed_total is left out on purpose — the trigger owns it.
insert into public.custom_field_definitions (id, org_id, key, label, value_type, allowed_values) values
	('a3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'warranty_years', 'Warranty (years)', 'numeric', null),
	('a3000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'includes_onboarding', 'Onboarding included', 'boolean', null),
	('a3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'support_tier', 'Support tier', 'select', '["email", "business hours", "24/7"]')
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

-- Proposal 1 hangs off the Wayne deal; proposal 2 off the Wayne client.
insert into public.proposals (id, org_id, entity_type, entity_id, title, base_config, status,
		default_fee, tax_rate, valid_until, deck_id, created_by) values
	('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'deal', '40000000-0000-0000-0000-000000000001', 'Annual support contract — options',
		'{"seats": 120, "regions": ["us-east", "eu-west"]}', 'sent',
		250.00, 8.25, now() + interval '30 days',
		'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
	('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'client', '20000000-0000-0000-0000-000000000001', 'Website redesign',
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

insert into public.proposal_custom_field_values (id, org_id, proposal_option_id, field_definition_id,
		value_text, value_numeric, value_boolean) values
	('a4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', null, 1, null),
	('a4000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', null, 2, null),
	('a4000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', null, 3, null),
	('a4000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', null, null, false),
	('a4000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', null, null, true),
	('a4000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000002', null, null, true),
	('a4000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'email', null, null),
	('a4000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', 'business hours', null, null),
	('a4000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
		'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000003', '24/7', null, null)
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
