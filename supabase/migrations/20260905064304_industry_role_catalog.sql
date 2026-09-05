-- Industry catalog: four more verticals, the features each one includes,
-- and a full role ladder for every industry — the spectrum an owner/admin
-- hands out to members, from a read-only Viewer up to a Director who can
-- delete. Everything here is reference data in the tiers mechanism:
-- shipped by migration, readable by every signed-in user, written only by
-- migrations / the service role, so onboarding an org into any of these
-- industries still needs zero role setup.
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
-- (01 general, 02 construction, 03 healthcare, 04 real-estate, 05 legal,
-- 06 hospitality) and RR the role within it. The three roles the
-- roles_permissions migration shipped (…-0000-000000000001/2/3) predate the
-- scheme and keep their ids. Idempotent throughout so a re-apply is a no-op.

-- ---------------------------------------------------------------------------
-- industries — four more verticals
-- ---------------------------------------------------------------------------

insert into public.industries (id, name) values
	('healthcare', 'Healthcare'),
	('real-estate', 'Real Estate'),
	('legal', 'Legal'),
	('hospitality', 'Hospitality')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_features — what exists in each new vertical
-- ---------------------------------------------------------------------------

-- Deliberately different shapes so the hidden mode has fixtures: a clinic
-- runs no deal pipeline, an agency has no ticket queue, a law firm has the
-- whole catalog like general, and hospitality lacks only the enterprise
-- library page. Staff and components are in every industry, like general.
insert into public.industry_features (industry_id, feature_id) values
	('healthcare', 'clients'),
	('healthcare', 'tasks'),
	('healthcare', 'tickets'),
	('healthcare', 'staff'),
	('healthcare', 'components'),
	('real-estate', 'clients'),
	('real-estate', 'deals'),
	('real-estate', 'tasks'),
	('real-estate', 'staff'),
	('real-estate', 'components'),
	('real-estate', 'best-practices'),
	('legal', 'clients'),
	('legal', 'deals'),
	('legal', 'tasks'),
	('legal', 'tickets'),
	('legal', 'staff'),
	('legal', 'components'),
	('legal', 'best-practices'),
	('hospitality', 'clients'),
	('hospitality', 'deals'),
	('hospitality', 'tasks'),
	('hospitality', 'tickets'),
	('hospitality', 'staff'),
	('hospitality', 'components')
on conflict (industry_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- roles — the ladder for every industry
-- ---------------------------------------------------------------------------

insert into public.roles (id, industry_id, name, description) values
	-- general (Support and Sales already exist)
	('b0000000-0000-0000-0001-000000000001', 'general', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0001-000000000002', 'general', 'Operations',
		'Runs the task board; can look up clients, tickets and the roster.'),
	('b0000000-0000-0000-0001-000000000003', 'general', 'Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0001-000000000004', 'general', 'Director',
		'Manages every feature and can delete.'),
	-- construction (Support already exists)
	('b0000000-0000-0000-0002-000000000001', 'construction', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0002-000000000002', 'construction', 'Site Supervisor',
		'Runs the job list on site; can look up clients, tickets and the crew.'),
	('b0000000-0000-0000-0002-000000000003', 'construction', 'Safety Officer',
		'Works the incident queue; can see the job list and the crew.'),
	('b0000000-0000-0000-0002-000000000004', 'construction', 'Project Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0002-000000000005', 'construction', 'Operations Director',
		'Manages every feature and can delete.'),
	-- healthcare
	('b0000000-0000-0000-0003-000000000001', 'healthcare', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0003-000000000002', 'healthcare', 'Front Desk',
		'Registers and updates patients; can see follow-ups and requests.'),
	('b0000000-0000-0000-0003-000000000003', 'healthcare', 'Care Coordinator',
		'Runs patients and their follow-ups; can see requests and the roster.'),
	('b0000000-0000-0000-0003-000000000004', 'healthcare', 'Patient Support',
		'Works the request queue; can look patients up.'),
	('b0000000-0000-0000-0003-000000000005', 'healthcare', 'Practice Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0003-000000000006', 'healthcare', 'Medical Director',
		'Manages every feature and can delete.'),
	-- real-estate
	('b0000000-0000-0000-0004-000000000001', 'real-estate', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0004-000000000002', 'real-estate', 'Listing Coordinator',
		'Runs the to-do list; can see clients, listings and the components library.'),
	('b0000000-0000-0000-0004-000000000003', 'real-estate', 'Agent',
		'Runs clients, listings and follow-ups; can see the roster and best practices.'),
	('b0000000-0000-0000-0004-000000000004', 'real-estate', 'Broker',
		'Manages every feature.'),
	('b0000000-0000-0000-0004-000000000005', 'real-estate', 'Managing Broker',
		'Manages every feature and can delete.'),
	-- legal
	('b0000000-0000-0000-0005-000000000001', 'legal', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0005-000000000002', 'legal', 'Paralegal',
		'Runs the task list; can see clients, matters, requests and best practices.'),
	('b0000000-0000-0000-0005-000000000003', 'legal', 'Client Services',
		'Works the request queue; can look up clients and tasks.'),
	('b0000000-0000-0000-0005-000000000004', 'legal', 'Associate',
		'Runs clients, matters and tasks; can see requests, the roster and best practices.'),
	('b0000000-0000-0000-0005-000000000005', 'legal', 'Partner',
		'Manages every feature.'),
	('b0000000-0000-0000-0005-000000000006', 'legal', 'Managing Partner',
		'Manages every feature and can delete.'),
	-- hospitality
	('b0000000-0000-0000-0006-000000000001', 'hospitality', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0006-000000000002', 'hospitality', 'Front of House',
		'Runs guests and their requests; can see the task board.'),
	('b0000000-0000-0000-0006-000000000003', 'hospitality', 'Events Coordinator',
		'Runs guests, bookings and tasks; can see requests.'),
	('b0000000-0000-0000-0006-000000000004', 'hospitality', 'Operations',
		'Runs the task board; can see requests, the roster and the components library.'),
	('b0000000-0000-0000-0006-000000000005', 'hospitality', 'General Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0006-000000000006', 'hospitality', 'Regional Director',
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
	('b0000000-0000-0000-0001-000000000001'::uuid, 'general', 'read'::public.permission_level),
	('b0000000-0000-0000-0001-000000000003', 'general', 'manage'),
	('b0000000-0000-0000-0001-000000000004', 'general', 'delete'),
	('b0000000-0000-0000-0002-000000000001', 'construction', 'read'),
	('b0000000-0000-0000-0002-000000000004', 'construction', 'manage'),
	('b0000000-0000-0000-0002-000000000005', 'construction', 'delete'),
	('b0000000-0000-0000-0003-000000000001', 'healthcare', 'read'),
	('b0000000-0000-0000-0003-000000000005', 'healthcare', 'manage'),
	('b0000000-0000-0000-0003-000000000006', 'healthcare', 'delete'),
	('b0000000-0000-0000-0004-000000000001', 'real-estate', 'read'),
	('b0000000-0000-0000-0004-000000000004', 'real-estate', 'manage'),
	('b0000000-0000-0000-0004-000000000005', 'real-estate', 'delete'),
	('b0000000-0000-0000-0005-000000000001', 'legal', 'read'),
	('b0000000-0000-0000-0005-000000000005', 'legal', 'manage'),
	('b0000000-0000-0000-0005-000000000006', 'legal', 'delete'),
	('b0000000-0000-0000-0006-000000000001', 'hospitality', 'read'),
	('b0000000-0000-0000-0006-000000000005', 'hospitality', 'manage'),
	('b0000000-0000-0000-0006-000000000006', 'hospitality', 'delete')
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
	-- general / Operations
	('b0000000-0000-0000-0001-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0001-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'staff', 'read'),
	('b0000000-0000-0000-0001-000000000002', 'components', 'read'),
	-- construction / Site Supervisor
	('b0000000-0000-0000-0002-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0002-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0002-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0002-000000000002', 'staff', 'read'),
	-- construction / Safety Officer
	('b0000000-0000-0000-0002-000000000003', 'tickets', 'manage'),
	('b0000000-0000-0000-0002-000000000003', 'tasks', 'read'),
	('b0000000-0000-0000-0002-000000000003', 'staff', 'read'),
	-- healthcare / Front Desk
	('b0000000-0000-0000-0003-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0003-000000000002', 'tasks', 'read'),
	('b0000000-0000-0000-0003-000000000002', 'tickets', 'read'),
	-- healthcare / Care Coordinator
	('b0000000-0000-0000-0003-000000000003', 'clients', 'manage'),
	('b0000000-0000-0000-0003-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0003-000000000003', 'tickets', 'read'),
	('b0000000-0000-0000-0003-000000000003', 'staff', 'read'),
	-- healthcare / Patient Support
	('b0000000-0000-0000-0003-000000000004', 'tickets', 'manage'),
	('b0000000-0000-0000-0003-000000000004', 'clients', 'read'),
	-- real-estate / Listing Coordinator
	('b0000000-0000-0000-0004-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0004-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0004-000000000002', 'deals', 'read'),
	('b0000000-0000-0000-0004-000000000002', 'components', 'read'),
	-- real-estate / Agent
	('b0000000-0000-0000-0004-000000000003', 'clients', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'deals', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0004-000000000003', 'staff', 'read'),
	('b0000000-0000-0000-0004-000000000003', 'best-practices', 'read'),
	-- legal / Paralegal
	('b0000000-0000-0000-0005-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0005-000000000002', 'clients', 'read'),
	('b0000000-0000-0000-0005-000000000002', 'deals', 'read'),
	('b0000000-0000-0000-0005-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0005-000000000002', 'best-practices', 'read'),
	-- legal / Client Services
	('b0000000-0000-0000-0005-000000000003', 'tickets', 'manage'),
	('b0000000-0000-0000-0005-000000000003', 'clients', 'read'),
	('b0000000-0000-0000-0005-000000000003', 'tasks', 'read'),
	-- legal / Associate
	('b0000000-0000-0000-0005-000000000004', 'clients', 'manage'),
	('b0000000-0000-0000-0005-000000000004', 'deals', 'manage'),
	('b0000000-0000-0000-0005-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0005-000000000004', 'tickets', 'read'),
	('b0000000-0000-0000-0005-000000000004', 'staff', 'read'),
	('b0000000-0000-0000-0005-000000000004', 'best-practices', 'read'),
	-- hospitality / Front of House
	('b0000000-0000-0000-0006-000000000002', 'clients', 'manage'),
	('b0000000-0000-0000-0006-000000000002', 'tickets', 'manage'),
	('b0000000-0000-0000-0006-000000000002', 'tasks', 'read'),
	-- hospitality / Events Coordinator
	('b0000000-0000-0000-0006-000000000003', 'clients', 'manage'),
	('b0000000-0000-0000-0006-000000000003', 'deals', 'manage'),
	('b0000000-0000-0000-0006-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0006-000000000003', 'tickets', 'read'),
	-- hospitality / Operations
	('b0000000-0000-0000-0006-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0006-000000000004', 'tickets', 'read'),
	('b0000000-0000-0000-0006-000000000004', 'staff', 'read'),
	('b0000000-0000-0000-0006-000000000004', 'components', 'read')
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
-- industry through organizations.industry_id, set by onboarding /
-- service-role code — never from the browser.
