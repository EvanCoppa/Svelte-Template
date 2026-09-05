-- Industry catalog: the six verticals this product ships — crm, roofing,
-- medical-supplies, cosmetic, dentistry, beverage — the features each one
-- includes, and a full role ladder for every industry: the spectrum an
-- owner/admin hands out to members, from a read-only Viewer up to a
-- Director who can delete. Everything here is reference data in the tiers
-- mechanism: shipped by migration, readable by every signed-in user, written
-- only by migrations / the service role, so onboarding an org into any of
-- these industries still needs zero role setup.
--
-- Two of the six take over the industries the roles_permissions migration
-- shipped: 'general' (the default every new org got) becomes 'crm', the
-- neutral vertical of a CRM product, and 'construction' becomes 'roofing'.
-- The re-homing is an UPDATE, not a delete-and-recreate: existing orgs,
-- their roles (Support and Sales, construction's Support) and their industry
-- feature maps keep every row and id and simply move, the column default
-- follows, and the two old catalog rows go only once nothing references
-- them — Postgres checks the foreign keys, so a miss fails loudly instead of
-- leaving orphans.
--
-- Every industry's ladder has the same shape, with vertical-specific names:
--
--   Viewer        read on every feature in the industry — the floor
--   specialists   manage on their own domain, read on what borders it
--   Manager       manage on every feature in the industry
--   Director      delete on every feature — the ceiling short of owner/admin,
--                 who hold delete implicitly (private.feature_level)
--
-- Role ids are fixed, in the b0000000-… range the roles_permissions
-- migration reserved for roles, segmented so they stay greppable:
-- b0000000-0000-0000-00II-0000000000RR, where II is the industry
-- (01 crm, 02 roofing, 03 medical-supplies, 04 cosmetic, 05 dentistry,
-- 06 beverage) and RR the role within it. The three roles the
-- roles_permissions migration shipped (…-0000-000000000001/2/3) predate the
-- scheme and keep their ids. Idempotent throughout so a re-apply is a no-op.

-- ---------------------------------------------------------------------------
-- industries — the six verticals
-- ---------------------------------------------------------------------------

insert into public.industries (id, name) values
	('crm', 'CRM'),
	('roofing', 'Roofing'),
	('medical-supplies', 'Medical Supplies'),
	('cosmetic', 'Cosmetic'),
	('dentistry', 'Dentistry'),
	('beverage', 'Beverage')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- general -> crm, construction -> roofing
-- ---------------------------------------------------------------------------

-- Orgs first (they hold the only non-cascading foreign key), then the
-- default new orgs get, then the roles and feature maps, then the old rows.
-- Each statement matches zero rows on a re-apply.
update public.organizations set industry_id = 'crm' where industry_id = 'general';
update public.organizations set industry_id = 'roofing' where industry_id = 'construction';

alter table public.organizations alter column industry_id set default 'crm';

update public.roles set industry_id = 'crm' where industry_id = 'general';
update public.roles set industry_id = 'roofing' where industry_id = 'construction';

update public.industry_features set industry_id = 'crm' where industry_id = 'general';
update public.industry_features set industry_id = 'roofing' where industry_id = 'construction';

delete from public.industries where id in ('general', 'construction');

-- ---------------------------------------------------------------------------
-- industry_features — what exists in each new vertical
-- ---------------------------------------------------------------------------

-- crm keeps general's full catalog and roofing keeps construction's (no
-- deals, no best-practices — the seeded pilot override on Globex still has
-- something to override). The rest are deliberately different shapes so the
-- hidden mode has fixtures: a distributor runs the whole pipeline, a beauty
-- brand has no ticket queue, a dental practice has no deal pipeline. Staff
-- and components are in every industry.
insert into public.industry_features (industry_id, feature_id) values
	('medical-supplies', 'clients'),
	('medical-supplies', 'deals'),
	('medical-supplies', 'tasks'),
	('medical-supplies', 'tickets'),
	('medical-supplies', 'staff'),
	('medical-supplies', 'components'),
	('cosmetic', 'clients'),
	('cosmetic', 'deals'),
	('cosmetic', 'tasks'),
	('cosmetic', 'staff'),
	('cosmetic', 'components'),
	('cosmetic', 'best-practices'),
	('dentistry', 'clients'),
	('dentistry', 'tasks'),
	('dentistry', 'tickets'),
	('dentistry', 'staff'),
	('dentistry', 'components'),
	('beverage', 'clients'),
	('beverage', 'deals'),
	('beverage', 'tasks'),
	('beverage', 'tickets'),
	('beverage', 'staff'),
	('beverage', 'components'),
	('beverage', 'best-practices')
on conflict (industry_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- roles — the ladder for every industry
-- ---------------------------------------------------------------------------

insert into public.roles (id, industry_id, name, description) values
	-- crm (Support and Sales already exist, re-homed from general)
	('b0000000-0000-0000-0001-000000000001', 'crm', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0001-000000000002', 'crm', 'Operations',
		'Runs the task board; can look up clients, tickets and the roster.'),
	('b0000000-0000-0000-0001-000000000003', 'crm', 'Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0001-000000000004', 'crm', 'Director',
		'Manages every feature and can delete.'),
	-- roofing (Support already exists, re-homed from construction)
	('b0000000-0000-0000-0002-000000000001', 'roofing', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0002-000000000002', 'roofing', 'Crew Lead',
		'Runs the job list on site; can look up clients, callbacks and the crew.'),
	('b0000000-0000-0000-0002-000000000003', 'roofing', 'Safety Officer',
		'Works the incident queue; can see the job list and the crew.'),
	('b0000000-0000-0000-0002-000000000004', 'roofing', 'Project Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0002-000000000005', 'roofing', 'Operations Director',
		'Manages every feature and can delete.'),
	-- medical-supplies
	('b0000000-0000-0000-0003-000000000001', 'medical-supplies', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0003-000000000002', 'medical-supplies', 'Customer Service',
		'Works the support queue; can look up accounts and orders in progress.'),
	('b0000000-0000-0000-0003-000000000003', 'medical-supplies', 'Sales Rep',
		'Runs accounts, quotes and follow-ups; can see support requests.'),
	('b0000000-0000-0000-0003-000000000004', 'medical-supplies', 'Fulfillment',
		'Runs the order task board; can see accounts, requests and the roster.'),
	('b0000000-0000-0000-0003-000000000005', 'medical-supplies', 'Sales Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0003-000000000006', 'medical-supplies', 'Operations Director',
		'Manages every feature and can delete.'),
	-- cosmetic
	('b0000000-0000-0000-0004-000000000001', 'cosmetic', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0004-000000000002', 'cosmetic', 'Beauty Advisor',
		'Runs client profiles; can see orders and the to-do list.'),
	('b0000000-0000-0000-0004-000000000003', 'cosmetic', 'Account Executive',
		'Runs clients, orders and follow-ups; can see the roster and best practices.'),
	('b0000000-0000-0000-0004-000000000004', 'cosmetic', 'Studio Coordinator',
		'Runs the to-do list; can see clients and the components library.'),
	('b0000000-0000-0000-0004-000000000005', 'cosmetic', 'Brand Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0004-000000000006', 'cosmetic', 'Creative Director',
		'Manages every feature and can delete.'),
	-- dentistry
	('b0000000-0000-0000-0005-000000000001', 'dentistry', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0005-000000000002', 'dentistry', 'Front Desk',
		'Registers and updates patients; can see recalls and requests.'),
	('b0000000-0000-0000-0005-000000000003', 'dentistry', 'Hygienist',
		'Runs recalls and follow-ups; can look patients and requests up.'),
	('b0000000-0000-0000-0005-000000000004', 'dentistry', 'Patient Support',
		'Works the request queue; can look patients up.'),
	('b0000000-0000-0000-0005-000000000005', 'dentistry', 'Practice Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0005-000000000006', 'dentistry', 'Lead Dentist',
		'Manages every feature and can delete.'),
	-- beverage
	('b0000000-0000-0000-0006-000000000001', 'beverage', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0006-000000000002', 'beverage', 'Route Sales Rep',
		'Runs accounts, orders and follow-ups; can see support requests.'),
	('b0000000-0000-0000-0006-000000000003', 'beverage', 'Distribution Coordinator',
		'Runs the delivery task board; can see accounts, requests and the roster.'),
	('b0000000-0000-0000-0006-000000000004', 'beverage', 'Account Support',
		'Works the request queue; can look up accounts and tasks.'),
	('b0000000-0000-0000-0006-000000000005', 'beverage', 'Sales Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0006-000000000006', 'beverage', 'Regional Director',
		'Manages every feature and can delete.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- role_permissions — the ladder rungs that cover a whole industry
-- ---------------------------------------------------------------------------

-- Viewer, Manager and Director grant one level on EVERY feature in their
-- industry, so the rows are derived from industry_features rather than
-- listed: the intent ("read on everything the industry has") is the
-- statement, and a role can never silently miss a feature its industry
-- includes. A feature added to an industry later still needs its grants
-- (the features migration's checklist) — this only reads the map as it
-- stands at apply time.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0001-000000000001'::uuid, 'crm', 'read'::public.permission_level),
	('b0000000-0000-0000-0001-000000000003', 'crm', 'manage'),
	('b0000000-0000-0000-0001-000000000004', 'crm', 'delete'),
	('b0000000-0000-0000-0002-000000000001', 'roofing', 'read'),
	('b0000000-0000-0000-0002-000000000004', 'roofing', 'manage'),
	('b0000000-0000-0000-0002-000000000005', 'roofing', 'delete'),
	('b0000000-0000-0000-0003-000000000001', 'medical-supplies', 'read'),
	('b0000000-0000-0000-0003-000000000005', 'medical-supplies', 'manage'),
	('b0000000-0000-0000-0003-000000000006', 'medical-supplies', 'delete'),
	('b0000000-0000-0000-0004-000000000001', 'cosmetic', 'read'),
	('b0000000-0000-0000-0004-000000000005', 'cosmetic', 'manage'),
	('b0000000-0000-0000-0004-000000000006', 'cosmetic', 'delete'),
	('b0000000-0000-0000-0005-000000000001', 'dentistry', 'read'),
	('b0000000-0000-0000-0005-000000000005', 'dentistry', 'manage'),
	('b0000000-0000-0000-0005-000000000006', 'dentistry', 'delete'),
	('b0000000-0000-0000-0006-000000000001', 'beverage', 'read'),
	('b0000000-0000-0000-0006-000000000005', 'beverage', 'manage'),
	('b0000000-0000-0000-0006-000000000006', 'beverage', 'delete')
) as ladder (role_id, industry_id, level)
join public.industry_features f on f.industry_id = ladder.industry_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- role_permissions — the specialists
-- ---------------------------------------------------------------------------

-- Each specialist manages its own domain and reads what borders it. Only
-- features in the role's industry are granted: a grant on a hidden feature
-- would be inert (the resolver hides it before any grant is consulted).
insert into public.role_permissions (role_id, feature_id, level) values
	-- crm / Operations
	('b0000000-0000-0000-0001-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0001-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'staff', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'components', 'read'),
	-- roofing / Crew Lead
	('b0000000-0000-0000-0002-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0002-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0002-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0002-000000000002', 'staff', 'read'),
	-- roofing / Safety Officer
	('b0000000-0000-0000-0002-000000000003', 'tickets', 'manage'),
	('b0000000-0000-0000-0002-000000000003', 'tasks', 'read'),
	('b0000000-0000-0000-0002-000000000003', 'staff', 'read'),
	-- medical-supplies / Customer Service
	('b0000000-0000-0000-0003-000000000002', 'tickets', 'manage'),
	('b0000000-0000-0000-0003-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0003-000000000002', 'tasks', 'read'),
	-- medical-supplies / Sales Rep
	('b0000000-0000-0000-0003-000000000003', 'clients', 'manage'),
	('b0000000-0000-0000-0003-000000000003', 'deals', 'manage'),
	('b0000000-0000-0000-0003-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0003-000000000003', 'tickets', 'read'),
	-- medical-supplies / Fulfillment
	('b0000000-0000-0000-0003-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0003-000000000004', 'clients', 'read'),
	('b0000000-0000-0000-0003-000000000004', 'tickets', 'read'),
	('b0000000-0000-0000-0003-000000000004', 'staff', 'read'),
	-- cosmetic / Beauty Advisor
	('b0000000-0000-0000-0004-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0004-000000000002', 'deals', 'read'),
	('b0000000-0000-0000-0004-000000000002', 'tasks', 'read'),
	-- cosmetic / Account Executive
	('b0000000-0000-0000-0004-000000000003', 'clients', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'deals', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'staff', 'read'),
	('b0000000-0000-0000-0004-000000000003', 'best-practices', 'read'),
	-- cosmetic / Studio Coordinator
	('b0000000-0000-0000-0004-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0004-000000000004', 'clients', 'read'),
	('b0000000-0000-0000-0004-000000000004', 'components', 'read'),
	-- dentistry / Front Desk
	('b0000000-0000-0000-0005-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0005-000000000002', 'tasks', 'read'),
	('b0000000-0000-0000-0005-000000000002', 'tickets', 'read'),
	-- dentistry / Hygienist
	('b0000000-0000-0000-0005-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0005-000000000003', 'clients', 'read'),
	('b0000000-0000-0000-0005-000000000003', 'tickets', 'read'),
	-- dentistry / Patient Support
	('b0000000-0000-0000-0005-000000000004', 'tickets', 'manage'),
	('b0000000-0000-0000-0005-000000000004', 'clients', 'read'),
	-- beverage / Route Sales Rep
	('b0000000-0000-0000-0006-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0006-000000000002', 'deals', 'manage'),
	('b0000000-0000-0000-0006-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0006-000000000002', 'tickets', 'read'),
	-- beverage / Distribution Coordinator
	('b0000000-0000-0000-0006-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0006-000000000003', 'clients', 'read'),
	('b0000000-0000-0000-0006-000000000003', 'tickets', 'read'),
	('b0000000-0000-0000-0006-000000000003', 'staff', 'read'),
	-- beverage / Account Support
	('b0000000-0000-0000-0006-000000000004', 'tickets', 'manage'),
	('b0000000-0000-0000-0006-000000000004', 'clients', 'read'),
	('b0000000-0000-0000-0006-000000000004', 'tasks', 'read')
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- How to add an industry
-- ---------------------------------------------------------------------------
-- In one migration: insert its industries row, the industry_features rows
-- for every feature it includes, its roles (a Viewer / Manager / Director
-- ladder plus the vertical's specialists, ids in the next II segment), and
-- the grants — the ladder rungs through the industry_features join above,
-- the specialists listed. Then give seed.sql an org in it so every mode and
-- rung is exercisable after `npm run db:reset`. Nothing in the app changes:
-- roles, the gate and the nav all read the catalog. An org joins the
-- industry through organizations.industry_id (default 'crm'), set by
-- onboarding / service-role code — never from the browser. Retiring an
-- industry is the re-homing block above, in that order.
