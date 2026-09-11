-- Roofing, filled in: the rungs, the grants and the page the vertical was missing
-- ===========================================================================
-- `roofing` has shipped since the industry_role_catalog migration and has been
-- named steadily since — Quotes, Services, Packages, Homeowners, an Estimator
-- and a Project manager on every quote. What it never got is the rest of the
-- ladder those words imply, and a page for the one thing a roofer does that a
-- CRM does not: plan a route to a street full of houses.
--
-- Four things, all reference data, no app change beyond one id in FEATURE_IDS:
--
--   1. the Estimator role — the vocabulary has named it since the
--      industry_vocabulary migration and the catalog has never had it
--   2. the two grants the derivation chain never reached: a ladder rung's
--      grants are derived and a specialist's are listed, but later migrations
--      chained their own derivations off tasks, companies and proposals and
--      carried the specialists along — everywhere except `assets`, which
--      derives from `products`, a catalog grant no site role holds
--   3. `homeowner-map` — a views row, the roofing cut of patient-map
--   4. roofing's words for two features, and its whole sidebar section
--      re-numbered around the newcomer
--
-- Everything is idempotent, so a re-apply is a no-op. See docs/roofing.md for
-- the gaps this deliberately does NOT close (Jobs, industry custom fields, the
-- material chain) and why each waits for its own migration.

-- ---------------------------------------------------------------------------
-- 1. The Estimator
-- ---------------------------------------------------------------------------

-- Id in the scheme the catalog reserved: b0000000-0000-0000-00II-0000000000RR,
-- II = 02 (roofing), RR = 06 (the next rung after Operations Director).
insert into public.roles (id, industry_id, name, description) values
	('b0000000-0000-0000-0002-000000000006', 'roofing', 'Estimator',
		'Sells the work: runs quotes, the homeowners they are for, and the inspections that lead to them.')
on conflict (id) do nothing;

-- A specialist manages its own domain and reads what borders it. An
-- estimator's domain is the quote, the person it is for and the visit that
-- produces it; the catalog it prices from and the money that follows are
-- things they look at, not things they change.
insert into public.role_permissions (role_id, feature_id, level) values
	('b0000000-0000-0000-0002-000000000006', 'proposals', 'manage'),
	('b0000000-0000-0000-0002-000000000006', 'contacts', 'manage'),
	('b0000000-0000-0000-0002-000000000006', 'companies', 'manage'),
	('b0000000-0000-0000-0002-000000000006', 'calendar', 'manage'),
	('b0000000-0000-0000-0002-000000000006', 'notes', 'manage'),
	('b0000000-0000-0000-0002-000000000006', 'tasks', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'billables', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'quick-plans', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'products', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'invoices', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'ledger', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'tickets', 'read'),
	('b0000000-0000-0000-0002-000000000006', 'staff', 'read')
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The two the chain never reached
-- ---------------------------------------------------------------------------

-- Checked against a reset, the site roles are already far better off than
-- "listed, not derived" suggests: the calendar came from tasks, contacts and
-- the assistant from companies, the catalog and the money pair from proposals,
-- the views from their source. Two holes are left, and both matter on a roof.
--
-- `assets` derives from `products` — a catalog grant neither site role has —
-- so neither can open the PROPERTY the work is done on. And Safety Officer is
-- the only specialist in the catalog with no `contacts` grant at all, while
-- working the queue of callbacks that are about a homeowner.
insert into public.role_permissions (role_id, feature_id, level) values
	('b0000000-0000-0000-0002-000000000002', 'assets', 'read'),
	('b0000000-0000-0000-0002-000000000003', 'assets', 'read'),
	('b0000000-0000-0000-0002-000000000003', 'contacts', 'read')
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. homeowner-map — a views row, no route
-- ---------------------------------------------------------------------------

-- The roofing cut of patient-map: the people who belong to no company, opened
-- on the map. A practice recalls patients by postcode; a roofer works a
-- street, and the pins ARE the plan for the morning. Same source, same filter,
-- same page (src/routes/(app)/views/[view=view]/) — a different row, because a
-- view is a query with a page (the views migration).
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('homeowner-map', 'Homeowner map', 'homeowner',
		'Where your homeowners are, on a map.',
		'/views/homeowner-map', 'map-pin', 'crm', 19)
on conflict (id) do nothing;

insert into public.views (id, source, filter, columns, layouts, default_layout) values
	('homeowner-map', 'contact',
		'{"where": [{"field": "has_company", "op": "eq", "value": false}]}',
		'{name,phone,email,status,city}', '{map,table}', 'map')
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('view-homeowner-map', 'homeowner-map', '/views/homeowner-map', null)
on conflict (id) do nothing;

-- One industry, like patient-map. A distributor has no map of people who
-- belong to no company, because it has no such people.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('roofing', 'homeowner-map', null, null)
on conflict (industry_id, feature_id) do nothing;

-- A view costs nothing to serve, so every plan has it (the views migration).
insert into public.tier_features (tier_id, feature_id)
select t.id, 'homeowner-map'
from public.tiers t
on conflict (tier_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The derived grants, re-run
-- ---------------------------------------------------------------------------

-- Two derivations in earlier migrations state an invariant rather than a list:
-- whoever may read a view's source may read the view, and whoever may keep the
-- catalog may keep the register. Both ran before the Estimator and before
-- homeowner-map existed, so both are re-run here — the same statements,
-- verbatim — rather than hand-listing what they would have produced. That is
-- what keeps "a role added later cannot silently miss it" true of a role and a
-- view added later.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, v.id, 'read'::public.permission_level
from public.views v
join public.role_permissions rp
	on rp.feature_id = case v.source when 'company' then 'companies' when 'contact' then 'contacts' end
on conflict (role_id, feature_id) do nothing;

insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'assets', rp.level
from public.role_permissions rp
where rp.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;

-- The ladder rungs, likewise derived: Viewer reads everything in the industry,
-- Project Manager manages it, Operations Director deletes it. Re-run so the
-- three pick up homeowner-map without naming it.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0002-000000000001'::uuid, 'roofing', 'read'::public.permission_level),
	('b0000000-0000-0000-0002-000000000004', 'roofing', 'manage'),
	('b0000000-0000-0000-0002-000000000005', 'roofing', 'delete')
) as ladder (role_id, industry_id, level)
join public.industry_features f on f.industry_id = ladder.industry_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Roofing's words, and its order
-- ---------------------------------------------------------------------------

-- Two features a roofer does not call what a CRM calls them. `assets` is the
-- properties it works on — the rename is the industry axis doing its job, and
-- the tension is deliberate and documented (docs/roofing.md): a customer's
-- roof is not a thing the org owns, and if a property ever needs columns an
-- asset should not have, that is when it becomes its own kind rather than a
-- word. `tickets` is the callback: a roof that leaks after you left.
update public.industry_features as f
set name = v.name, noun = v.noun
from (values
	('roofing', 'assets', 'Properties', 'property'),
	('roofing', 'tickets', 'Callbacks', 'callback')
) as v (industry_id, feature_id, name, noun)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- The whole CRM section, re-numbered — every row of it, not just the newcomer,
-- which is the rule the industry_feature_order migration closes on: a section
-- with some rows ordered and the rest inheriting reads as two interleaved
-- lists. Multiples of 50 inside the hundreds, so the features docs/roofing.md
-- phases in next (Jobs at 100, Material orders at 600, Deliveries at 650)
-- slot in without touching a number here.
--
-- The order is the order of the work: the quote is what a roofer sells, the
-- bill and the balance follow it, the homeowner is who both are for, and the
-- map is a cut of the homeowners — directly after the records it filters.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('roofing', 'proposals', 200),
	('roofing', 'invoices', 300),
	('roofing', 'ledger', 350),
	('roofing', 'contacts', 400),
	('roofing', 'homeowner-map', 450),
	('roofing', 'companies', 500),
	('roofing', 'suppliers', 550),
	('roofing', 'calendar', 700),
	('roofing', 'tasks', 800),
	('roofing', 'assets', 900),
	('roofing', 'tickets', 1000)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- What this migration does NOT do
-- ---------------------------------------------------------------------------
-- docs/roofing.md is the plan; the four things left are each their own file
-- because each is a decision, not a gap:
--
--   Jobs          `deals` into roofing named Jobs, plus an industry-aware
--                 create_default_pipeline() — and a rewrite of the seed
--                 comment on Globex's override, which currently says deals is
--                 outside roofing's industry
--   custom fields the industry axis custom_field_definitions never got:
--                 templates copied into an org on creation, the way names and
--                 order resolve but writable once they land
--   the material chain  `purchases` and `shipments` have tables and no
--                 features; a roofer's Material orders and Deliveries are
--                 those tables with rows here and a list page
--   claims        eleven custom fields first; a feature when they outgrow it
