-- Real estate: the rental-portfolio vertical, as rows
-- ===========================================================================
-- A small landlord operating company: they own the buildings, they fix the
-- buildings, they collect the rent, and once a year they hand a pile of
-- numbers to a CPA. The reference customer is two duplexes, five rentable
-- units and 81 transactions over eight months.
--
-- Every other vertical this product serves ends at a SALE. This one ends at a
-- REPORT — a Schedule E-style category rollup — and that inverts the usual
-- build order: the money is the pipeline, not the thing bolted on after it.
-- The full design, read off the customer's own workbook, is
-- docs/industry-real-estate.md.
--
-- This migration is CONFIG ONLY: an industries row, the industry's feature
-- map with its own words and its own sidebar order, and a six-rung role
-- ladder. No table, no column, no enum value, no view — so `npm run db:types`
-- produces no diff and NOTHING in src/ changes, not even a FEATURE_IDS line
-- (every feature named below already has one, and no new view is registered).
--
-- What that buys is a working property-and-tenant CRM with photos, a
-- maintenance queue, a schedule and a role model. What it CANNOT buy is the
-- half the customer actually asked for: a chart of accounts carrying the
-- Schedule E line, a categorised transactions table, leases, and loans. Those
-- are tables and routes, and the closing comment says what else is blocked
-- behind them.

-- ---------------------------------------------------------------------------
-- The industry
-- ---------------------------------------------------------------------------

insert into public.industries (id, name) values
	('real-estate', 'Real Estate')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_features — what exists here, what it is called, where it sits
-- ---------------------------------------------------------------------------
-- The words first, because none of them is a constant in src/: the sidebar,
-- the ⌘K palette, the tab title, the breadcrumb, the "Add …" button, the row
-- count and the record page all read the resolved name (the
-- feature_names_by_industry migration). A null inherits the feature's own
-- word, column by column.
--
-- `assets` carrying BOTH properties and units is the one large modeling
-- decision, and it is made here rather than with a table: `asset_type` is
-- free text (its column comment names 'property' as an example), a unit hangs
-- off its property by the already-shipped `part_of` type ('asset' → 'asset'),
-- an owner or a manager is a relationship per the assets rule, and beds /
-- baths / square feet / market rent are custom fields on 'asset'. So the
-- portfolio is rows in a table that already exists.
--
-- Two things that decision costs, both written up in the design doc: a
-- property CANNOT have an address yet (addresses is pinned to parties by
-- `addresses_entity_is_party`, and the record page gates the card on it), and
-- "Properties" and "Units" cannot be two nav entries until views accept an
-- `asset` source. Until then a property's units are its `part_of` children on
-- its own record page, which for five units is the better screen anyway.
--
-- The order is this vertical's (the industry_feature_order migration), and it
-- is the order of the work: they open the app to record what they spent and
-- see what it means. Multiples of 100, restarting per category — and set for
-- EVERY feature in a section that sets any, or the section reads as two
-- interleaved lists. `general` (Assistant, Notes, Team) sets none and inherits
-- all three, which is the same rule honoured the other way. The gaps are
-- deliberate: Leases slots in at 250 when it exists, renumbering nothing.
--
-- DELIBERATELY ABSENT, and each absence is the `hidden` mode rather than a
-- flag — resolveFeatures() answers `hidden`, the gate 404s the route and the
-- nav never draws it:
--
--   invoices, ledger   The closest call in the design. Rent genuinely is
--                      billed to a tenant and the ledger would answer "who is
--                      behind" for free — but 42% of this customer's rent
--                      arrives as an airbnb / VRBO / Furnished Finder payout
--                      with nobody to bill, and a tenant ledger covering only
--                      the long-term half is worse than none. Delinquency is
--                      a fold instead: the lease says the rent, the
--                      transactions say what came in. Turning them on later
--                      is ONE row in this table.
--   proposals,         A priced multi-option quote presented to a buyer. A
--   billables,         landlord quotes nobody. Genuinely absent, not
--   quick-plans        deferred.
--   products           The workbook has a `Materials List` tab and it is
--                      empty. Porting aspiration is how a clean model gets
--                      cluttered on day one; one row turns it on if the
--                      rehab work says otherwise.
--   the six views      Other verticals' cuts. Note `suppliers` (companies
--                      filtered `relationship = supplier`) is already
--                      shipped and already in FEATURE_IDS, so separating
--                      lenders and booking platforms out of Vendors later
--                      costs one row here and no code at all.
--   components,        Template pages. Our scaffolding, not a customer's
--   best-practices     product.

insert into public.industry_features (industry_id, feature_id, name, noun, sort_order) values
	-- General — inherits its order.
	('real-estate', 'assistant', null, null, null),
	('real-estate', 'notes', null, null, null),
	('real-estate', 'staff', null, null, null),

	-- CRM — the portfolio, then who is in it, then what broke, then the day,
	-- then who you pay, then the next building.
	('real-estate', 'assets', 'Properties', 'property', 100),
	('real-estate', 'contacts', 'Tenants', 'tenant', 200),
	-- 250 is Leases, when it exists.
	('real-estate', 'tickets', 'Maintenance requests', 'maintenance request', 300),
	('real-estate', 'calendar', 'Schedule', 'appointment', 400),
	('real-estate', 'tasks', null, null, 500),
	-- Everyone you pay, in one list: utilities, municipalities, contractors,
	-- insurers — and, until loans and payouts have a home of their own,
	-- lenders and booking platforms too. `relationship` already tells them
	-- apart (supplier / partner / customer), which is what makes the
	-- `suppliers` view a one-row upgrade rather than a build.
	('real-estate', 'companies', 'Vendors', 'vendor', 600),
	-- Buying the next building. Real for this customer — their second duplex
	-- is a hard-money purchase with a rehab budget still open — and one row
	-- to remove if a given org only holds what it already owns.
	('real-estate', 'deals', 'Acquisitions', 'acquisition', 700)
on conflict (industry_id, feature_id) do nothing;

-- Nothing is inserted into tier_features: that table is global per feature,
-- not per industry, so this vertical inherits the product's existing plan
-- split. On `free` that means Acquisitions and the Assistant arrive
-- `locked_visible` — an upgrade tease rather than a missing page, which is
-- the tier axis doing its job.

-- ---------------------------------------------------------------------------
-- roles — the ladder for this industry
-- ---------------------------------------------------------------------------
-- The catalog's scheme: b0000000-0000-0000-00II-0000000000RR, II the industry
-- (crm..beverage hold 0001-0006 and merchant-services took 0007, so this is
-- 0008) and RR the role.
--
-- The top rung is `Principal`, not `Owner`: `organization_members.role`
-- already has an 'owner' value and two different things called Owner on the
-- same screen is how a permission gets handed to the wrong person.
--
-- Bookkeeper and Accountant are thin TODAY and deliberately shipped anyway.
-- Both are defined against features that do not exist yet (transactions,
-- accounts, loans, the reports), and the specialist grants below are joined
-- to industry_features so a pair naming a feature this vertical lacks grants
-- nothing — the same guard the catalog uses. So they grow by adding rows
-- here, never by renumbering the ladder.
--
-- Accountant is the one worth reading twice. The entire workbook exists to be
-- handed to a CPA, and today that hand-off is an emailed file: stale on
-- arrival, and carrying tenant names and payment history the CPA does not
-- need. This role is that hand-off as a login — and note what it does NOT
-- grant: `contacts`. An accountant sees the portfolio and who you pay, and
-- nothing about the people living in the units. That is the whole argument
-- for the feature-and-level model in one row.

insert into public.roles (id, industry_id, name, description) values
	('b0000000-0000-0000-0008-000000000001', 'real-estate', 'Viewer',
		'Sees everything; changes nothing.'),
	('b0000000-0000-0000-0008-000000000002', 'real-estate', 'Bookkeeper',
		'Keeps the vendor book and, once the accounting features land, the transactions behind it.'),
	('b0000000-0000-0000-0008-000000000003', 'real-estate', 'Accountant',
		'Reads the portfolio and what it spends, for the tax return. Never sees tenants.'),
	('b0000000-0000-0000-0008-000000000004', 'real-estate', 'Property Manager',
		'Runs the buildings and the people in them: units, tenants, maintenance, the schedule.'),
	('b0000000-0000-0000-0008-000000000005', 'real-estate', 'Portfolio Manager',
		'Manages every feature.'),
	('b0000000-0000-0000-0008-000000000006', 'real-estate', 'Principal',
		'Manages every feature and can delete.')
on conflict (id) do nothing;

-- The three whole-industry rungs are DERIVED from industry_features rather
-- than listed, the way the catalog derives them: the intent ("read on
-- everything this industry has") is the statement, so a role can never
-- silently miss a feature — including anything added to the map later.
insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0008-000000000001'::uuid, 'read'::public.permission_level),
	('b0000000-0000-0000-0008-000000000005', 'manage'),
	('b0000000-0000-0000-0008-000000000006', 'delete')
) as ladder (role_id, level)
join public.industry_features f
	on f.industry_id = 'real-estate'
on conflict (role_id, feature_id) do nothing;

-- The specialists are listed, because what each one owns is the point of the
-- role. Joined to industry_features so a pair naming a feature this vertical
-- does not have grants nothing.
--
-- `read` on `assistant` is not decorative: a tool is withdrawn from the model
-- unless the caller holds the level its feature needs (docs/assistant.md), so
-- a role without it has no assistant at all. Accountant holds it on purpose —
-- "what did Corn Hill cost me in utilities last year" is the product with a
-- different interface — and the tool gating means it still cannot ask about
-- tenants.
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
	-- Bookkeeper — owns the vendor book today; the transactions, the chart of
	-- accounts and the loans join this list when they exist.
	('b0000000-0000-0000-0008-000000000002'::uuid, 'companies', 'manage'::public.permission_level),
	('b0000000-0000-0000-0008-000000000002', 'notes', 'manage'),
	('b0000000-0000-0000-0008-000000000002', 'tasks', 'manage'),
	('b0000000-0000-0000-0008-000000000002', 'assets', 'read'),
	('b0000000-0000-0000-0008-000000000002', 'contacts', 'read'),
	('b0000000-0000-0000-0008-000000000002', 'deals', 'read'),
	('b0000000-0000-0000-0008-000000000002', 'assistant', 'read'),

	-- Accountant — the CPA's login. The portfolio and the payees, read-only,
	-- and pointedly no `contacts`.
	('b0000000-0000-0000-0008-000000000003', 'assets', 'read'),
	('b0000000-0000-0000-0008-000000000003', 'companies', 'read'),
	('b0000000-0000-0000-0008-000000000003', 'assistant', 'read'),

	-- Property Manager — the buildings and the people in them. Reads the
	-- vendor list to call a plumber; does not manage it.
	('b0000000-0000-0000-0008-000000000004', 'assets', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'contacts', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'tickets', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'tasks', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'calendar', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'notes', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'companies', 'read'),
	('b0000000-0000-0000-0008-000000000004', 'deals', 'read'),
	('b0000000-0000-0000-0008-000000000004', 'staff', 'read'),
	('b0000000-0000-0000-0008-000000000004', 'assistant', 'read')
) as grants (role_id, feature_id, level)
join public.industry_features f
	on f.industry_id = 'real-estate' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- industry_terms — none, and that is the system working
-- ---------------------------------------------------------------------------
-- Both shipped terms (`proposal_presenter`, `proposal_responsible`) name the
-- two people on a proposal, and proposals are hidden here — so this is the
-- first vertical to need no vocabulary rows at all. `resolveVocabulary()`
-- falls back to each term's default label when an industry has no row, so
-- there is nothing to insert and nothing to inherit wrongly. A word that is
-- not used is not configured.

-- ---------------------------------------------------------------------------
-- What this vertical still does not have
-- ---------------------------------------------------------------------------
-- The accounting spine, which is the half the customer actually asked for.
-- None of it is config; all of it is tables and routes:
--
--   accounts        The chart of accounts, and the one column that makes the
--                   deliverable real: `schedule_e_line`. Org-definable rows
--                   (a dentist's chart and a landlord's share nothing) with a
--                   per-industry default set installed by trigger, the way
--                   `create_default_pipeline` already gives every new org a
--                   board.
--   transactions    One row per dollar in or out, carrying the property, the
--                   unit (nullable — that IS the workbook's "Shared" bucket),
--                   the account, the payee and the amount. Positive always;
--                   `accounts.kind` gives the direction, the way payments'
--                   `kind` does. This does NOT violate the ledger's "there is
--                   no ledger table": that rule forbids materialising a
--                   BALANCE a query can answer, and a categorised cash
--                   transaction is primary data.
--   leases          A tenancy has a rent and a deposit, so it is a row, not a
--                   relationship. Also where the two revenue shapes fall out
--                   without a second table: a unit with an active lease is
--                   long-term, a unit with none is on short-term and its
--                   income arrives as payouts from a platform company.
--   loans           The biggest hole in the customer's own file. Mortgage P&I
--                   is one line there, so principal and interest never split
--                   — and Schedule E deducts only the interest. In the
--                   reference workbook that is $32,333.02, 77% of everything
--                   booked as an operating expense, which is why the figure
--                   on their dashboard labelled "Net Income (Schedule E)" is
--                   not one.
--
-- Two smaller absences worth knowing before someone promises them, because
-- both LOOK free and are not — and they fail in opposite directions:
--
--   A property's ADDRESS needs `addresses_entity_is_party` widened plus the
--   record page's `party` gate dropped. A property's PHOTOS need nothing:
--   `entity_images` is pinned to 'asset', which is exactly this kind. Receipt
--   photos on a spend row hit the same constraint from the other side.
--
-- And one thing no industry can have yet, which this vertical hits for the
-- second time: `custom_field_definitions` is per-org working data, so an org
-- onboarded tomorrow gets none of the unit attributes that supabase/seed.sql
-- creates for the fixture orgs below. Merchant-services hit this with MID and
-- MCC and wrote the same note. Two verticals is the argument for the fix — a
-- table of per-industry default custom fields plus one trigger — and it is
-- deliberately not here, because that changes behaviour for every existing
-- industry and this migration changes none.
