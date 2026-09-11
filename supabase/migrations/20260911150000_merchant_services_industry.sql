-- Merchant services: the payment-processor vertical, as rows
-- ===========================================================================
-- An ISO / agent office signs businesses up to process card payments through
-- a back-end processor and lives off a share of what those merchants process.
-- The vertical is not defined by who the merchant is — a smoothie shop, a
-- liquor store and a dentist are all merchants — it is defined by what the
-- rep does: find a business, read its current statement, show it a cheaper
-- one, get an application signed, get it boarded.
--
-- That front half is what this migration turns on, and it is CONFIG ONLY:
-- an industries row, the industry's feature map with its own words and its
-- own sidebar order, three views, a role ladder and two vocabulary rows.
-- No table, no column, no enum value — so `npm run db:types` produces no
-- diff, and nothing in src/ changes except the three view ids in
-- FEATURE_IDS (src/lib/features/types.ts), which every view needs.
--
-- What the vertical needs and this CANNOT give it is written up in
-- docs/industry-merchant-services.md: merchant accounts (MIDs), residuals
-- and splits, statement analysis, application documents, and row-scoped
-- visibility so a 1099 agent sees their own book. The closing comment names
-- the smaller things too.

-- ---------------------------------------------------------------------------
-- The industry
-- ---------------------------------------------------------------------------

insert into public.industries (id, name) values
	('merchant-services', 'Merchant Services')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Three views — a query with a page (the views migration)
-- ---------------------------------------------------------------------------
-- A rep works a territory, a pipeline and a channel, and all three are cuts
-- of `companies`: the merchants on a map, the ones not signed yet, and the
-- banks and associations that send deals. None is worth a route (docs/views.md).

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('merchant-map', 'Merchant map', 'merchant',
		'Where your merchants are, on a map — the day''s territory.',
		'/views/merchant-map', 'map-pin', 'crm', 250),
	('prospects', 'Prospects', 'prospect',
		'Businesses you have not signed yet.',
		'/views/prospects', 'circle-dashed', 'crm', 260),
	('referral-partners', 'Referral partners', 'referral partner',
		'The banks, associations and software vendors that send you deals.',
		'/views/referral-partners', 'handshake', 'crm', 270)
on conflict (id) do nothing;

insert into public.views (id, source, filter, columns, layouts, default_layout) values
	('merchant-map', 'company',
		'{"where": [{"field": "relationship", "op": "in", "values": ["customer"]}]}',
		'{name,status,phone,email,city}', '{map,table}', 'map'),
	('prospects', 'company',
		'{"where": [{"field": "status", "op": "in", "values": ["lead", "prospect"]}]}',
		'{name,status,phone,email,city}', '{table,map}', 'table'),
	('referral-partners', 'company',
		'{"where": [{"field": "relationship", "op": "in", "values": ["partner"]}]}',
		'{name,status,email,phone,city}', '{table}', 'table')
on conflict (id) do nothing;

-- Titled by their feature, as the industry says it: `title` null.
insert into public.pages (id, feature_id, path, title) values
	('view-merchant-map', 'merchant-map', '/views/merchant-map', null),
	('view-prospects', 'prospects', '/views/prospects', null),
	('view-referral-partners', 'referral-partners', '/views/referral-partners', null)
on conflict (id) do nothing;

-- A view costs nothing to serve, so every plan has them — the rule the first
-- three views set.
insert into public.tier_features (tier_id, feature_id)
select t.id, v.feature_id
from public.tiers t
cross join (values ('merchant-map'), ('prospects'), ('referral-partners')) as v (feature_id)
on conflict (tier_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_features — what exists here, what it is called, where it sits
-- ---------------------------------------------------------------------------
-- The words first, because none of them is a constant in src/: the sidebar,
-- the ⌘K palette, the tab title, the breadcrumb, the "Add …" button, the row
-- count and the record page all read the resolved name (the
-- feature_names_by_industry migration). A null inherits the feature's own
-- word, column by column.
--
-- The order is this vertical's (the industry_feature_order migration), and
-- it is the order of the work: a rep opens the app to see what is in flight,
-- not to browse a database. Multiples of 100, restarting per category — and
-- set for EVERY feature in a section that sets any, or the section reads as
-- two interleaved lists. `general` (Assistant, Notes, Staff) sets none and
-- inherits all three, which is the same rule honoured the other way.
--
-- DELIBERATELY ABSENT, and each absence is the `hidden` mode rather than a
-- flag — the gate 404s the route and the nav never draws it:
--
--   invoices, ledger   An ISO does not bill its merchants: the processor
--                      deducts fees from the merchant's own deposits, so
--                      nothing is ever owed to the ISO on an invoice. The
--                      money question this vertical has is the mirror image
--                      (what the processor owes THEM), and that is a build.
--   suppliers          They buy terminals from one distributor, forever. A
--                      company with relationship = 'supplier' covers it
--                      without a nav entry.
--   partner-contacts   Superseded by `referral-partners`: the referral
--                      relationship is with the bank, not the person at it.
--   patient-map        Dentistry's. `merchant-map` is the same mechanism.
--   components,        Template pages. Our scaffolding, not a customer's
--   best-practices     product.

insert into public.industry_features (industry_id, feature_id, name, noun, sort_order) values
	-- General — inherits its order.
	('merchant-services', 'assistant', null, null, null),
	('merchant-services', 'notes', null, null, null),
	('merchant-services', 'staff', null, null, null),

	-- CRM — what is in flight, then the book and its cuts, then the people,
	-- then the artifact that wins the deal, then the day, then after the sale.
	('merchant-services', 'deals', 'Applications', 'application', 100),
	('merchant-services', 'companies', 'Merchants', 'merchant', 200),
	('merchant-services', 'merchant-map', null, null, 300),
	('merchant-services', 'prospects', null, null, 400),
	('merchant-services', 'referral-partners', null, null, 500),
	('merchant-services', 'contacts', 'Merchant contacts', 'contact', 600),
	('merchant-services', 'proposals', 'Rate proposals', 'rate proposal', 700),
	('merchant-services', 'calendar', 'Schedule', 'appointment', 800),
	('merchant-services', 'tasks', null, null, 900),
	('merchant-services', 'tickets', 'Support cases', 'support case', 1000),
	('merchant-services', 'assets', 'Terminals', 'terminal', 1100),

	-- Tools — what a price is built out of, the bundles a rep actually picks,
	-- then the hardware. `products` is the catalog of what they OFFER;
	-- `assets` above is the specific unit deployed on a counter.
	('merchant-services', 'billables', 'Fees', 'fee', 100),
	('merchant-services', 'quick-plans', 'Quick options', 'quick option', 200),
	('merchant-services', 'products', 'Equipment', 'equipment item', 300)
on conflict (industry_id, feature_id) do nothing;

-- Nothing is inserted into tier_features for the features above: that table
-- is global per feature, not per industry, so this vertical inherits the
-- product's existing plan split. On `free` that means Applications, Equipment
-- and the Assistant arrive `locked_visible` — an upgrade tease rather than a
-- missing page, which is exactly the tier axis doing its job.

-- ---------------------------------------------------------------------------
-- roles — the ladder for this industry
-- ---------------------------------------------------------------------------
-- The catalog's scheme: b0000000-0000-0000-00II-0000000000RR, II the
-- industry (crm..beverage hold 0001-0006, so this is 0007) and RR the role.
-- Shaped like medical-supplies', the closest existing vertical: a Viewer, the
-- specialists who each own one part of the funnel, a Manager over everything
-- and a Director who can delete.
--
-- What this ladder CANNOT express is the thing an agent office asks for
-- first: "a rep who sees their own merchants and nobody else's". A grant is
-- a level on a FEATURE, for the whole org, and every tenant-scoped select
-- policy reads `private.org_role(org_id) is not null` — so every member sees
-- every row. Until that changes (docs/industry-merchant-services.md, gap 1),
-- this vertical works for an office where the staff log in, not for one
-- where forty 1099 agents do.

insert into public.roles (id, industry_id, name, description) values
	('b0000000-0000-0000-0007-000000000001', 'merchant-services', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0007-000000000002', 'merchant-services', 'Sales Rep',
		'Runs merchants, applications and rate proposals; can see the fee schedule and what is deployed.'),
	('b0000000-0000-0000-0007-000000000003', 'merchant-services', 'Merchant Support',
		'Works the support queue; can look merchants, contacts and terminals up.'),
	('b0000000-0000-0000-0007-000000000004', 'merchant-services', 'Onboarding Coordinator',
		'Takes a signed application to a first batch: underwriting chase, equipment and deployment.'),
	('b0000000-0000-0000-0007-000000000005', 'merchant-services', 'Sales Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0007-000000000006', 'merchant-services', 'Principal',
		'Manages every feature and can delete.')
on conflict (id) do nothing;

-- The three whole-industry rungs are DERIVED from industry_features rather
-- than listed, the way the catalog derives them: the intent ("read on
-- everything this industry has") is the statement, so a role can never
-- silently miss a feature — including the three views above, which are rows
-- in that map like any other feature.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0007-000000000001'::uuid, 'read'::public.permission_level),
	('b0000000-0000-0000-0007-000000000005', 'manage'),
	('b0000000-0000-0000-0007-000000000006', 'delete')
) as ladder (role_id, level)
join public.industry_features f
	on f.industry_id = 'merchant-services'
on conflict (role_id, feature_id) do nothing;

-- The specialists are listed, because what each one owns is the point of the
-- role. Joined to industry_features so a pair naming a feature this vertical
-- does not have grants nothing — the same guard the catalog uses.
--
-- `read` on `assistant` is not decorative: a tool is withdrawn from the model
-- unless the caller holds the level its feature needs (docs/assistant.md), so
-- a role without it has no assistant at all.
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
	-- Sales Rep — owns the sell, reads the price list and the hardware.
	('b0000000-0000-0000-0007-000000000002'::uuid, 'companies', 'manage'::public.permission_level),
	('b0000000-0000-0000-0007-000000000002', 'contacts', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'deals', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'proposals', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'calendar', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'notes', 'manage'),
	('b0000000-0000-0000-0007-000000000002', 'merchant-map', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'prospects', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'referral-partners', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'billables', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'quick-plans', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'products', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'assets', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'tickets', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'staff', 'read'),
	('b0000000-0000-0000-0007-000000000002', 'assistant', 'read'),

	-- Merchant Support — owns the queue after the sale, reads the rest.
	('b0000000-0000-0000-0007-000000000003', 'tickets', 'manage'),
	('b0000000-0000-0000-0007-000000000003', 'tasks', 'manage'),
	('b0000000-0000-0000-0007-000000000003', 'notes', 'manage'),
	('b0000000-0000-0000-0007-000000000003', 'companies', 'read'),
	('b0000000-0000-0000-0007-000000000003', 'contacts', 'read'),
	('b0000000-0000-0000-0007-000000000003', 'merchant-map', 'read'),
	('b0000000-0000-0000-0007-000000000003', 'assets', 'read'),
	('b0000000-0000-0000-0007-000000000003', 'calendar', 'read'),
	('b0000000-0000-0000-0007-000000000003', 'assistant', 'read'),

	-- Onboarding Coordinator — owns the application from signature to first
	-- batch, and the box that has to reach the counter for it.
	('b0000000-0000-0000-0007-000000000004', 'deals', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'assets', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'products', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'calendar', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'notes', 'manage'),
	('b0000000-0000-0000-0007-000000000004', 'companies', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'contacts', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'proposals', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'tickets', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'billables', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'quick-plans', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'staff', 'read'),
	('b0000000-0000-0000-0007-000000000004', 'assistant', 'read')
) as grants (role_id, feature_id, level)
join public.industry_features f
	on f.industry_id = 'merchant-services' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_terms — the words that are not a feature's name
-- ---------------------------------------------------------------------------
-- The two people on a proposal (the industry_vocabulary migration). A missing
-- row inherits the default, so naming both is the whole change.

insert into public.industry_terms (industry_id, term_id, label) values
	('merchant-services', 'proposal_presenter', 'Rep'),
	('merchant-services', 'proposal_responsible', 'Relationship manager')
on conflict (industry_id, term_id) do nothing;

-- ---------------------------------------------------------------------------
-- What is still manual for an org in this vertical
-- ---------------------------------------------------------------------------
-- MID, MCC, average ticket and current processor are CUSTOM FIELDS, and
-- `custom_field_definitions` is per-org working data written by an owner or
-- admin — not reference data a migration can hand every org in an industry.
-- supabase/seed.sql creates them for the two fixture orgs so the vertical is
-- demonstrable after a reset, but a real org onboarded tomorrow starts with
-- none of them.
--
-- The mechanism to fix that exists and is one small migration: organizations
-- already get a default pipeline on insert (`create_default_pipeline`, called
-- by a trigger in the crm_pipelines migration). An industry-aware equivalent —
-- a table of per-industry default custom fields plus one trigger — would give
-- every new org in a vertical its fields, and every vertical the same
-- courtesy. Deliberately not done here: it changes behaviour for every
-- existing industry, and this migration changes no behaviour at all.
--
-- One caveat worth writing down before that is built: a custom field holds
-- ONE value per record, so `mid` on a merchant is right only while a merchant
-- has one MID. A business with three locations needs merchant accounts as a
-- record kind of their own (docs/industry-merchant-services.md, gap 2), and
-- these four fields are a bridge to that, not a substitute for it.
