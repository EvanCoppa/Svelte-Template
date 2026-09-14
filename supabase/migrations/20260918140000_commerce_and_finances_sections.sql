-- Two more sidebar sections, and the supplies vertical's own shape
-- ===========================================================================
-- The nav has had one section for everything you sell and no section for
-- money at all: a catalog sat under Tools beside the whiteboard, and invoices
-- and the ledger sat under CRM beside contacts. Those are three different
-- kinds of work sharing two headings, and it reads worst in a distributor,
-- where the catalog, the orders and the returns ARE the product and the
-- receivable is its own job.
--
-- So this adds `commerce` and `finances` to the categories a feature may name
-- and re-files the rows that belong in them. Two things to be clear about,
-- both of them consequences of how the registry is shaped rather than
-- oversights:
--
--   * A CATEGORY IS GLOBAL. `features.category` is one column on one row, and
--     CLAUDE.md says sections are deliberately not per-industry — so every
--     vertical sees these moves, not just medical supplies. A practice's
--     treatment plans move from CRM to Commerce with a roofer's quotes. That
--     is the trade the registry asks for: the alternative is a per-industry
--     section axis, which is a much bigger change than a nav tidy.
--   * AN EMPTY SECTION IS DROPPED (`groupNav()`), so a vertical that includes
--     none of these features never renders the heading.
--
-- The second half sets medical supplies' own order and words, so the vertical
-- reads the way a supply platform's sidebar actually reads. Only `sort_order`,
-- `name` and `noun` — the industry's own columns — are touched there; nothing
-- is added to or removed from what the vertical includes.

-- ---------------------------------------------------------------------------
-- The two new sections
-- ---------------------------------------------------------------------------
-- Mirrored by NAV_CATEGORIES in src/lib/navigation.ts, which carries each
-- section's label and the surface it renders on. The two lists have to agree:
-- a category this constraint allows but that file does not know is filed
-- under Other by `navCategoryOf()` rather than rendering a section.

alter table public.features drop constraint features_category_check;

alter table public.features
	add constraint features_category_check
		check (category is null or category in
			('general', 'crm', 'commerce', 'finances', 'tools', 'workspace', 'library', 'other'));

-- ---------------------------------------------------------------------------
-- Re-filing: what you sell, and what you are owed
-- ---------------------------------------------------------------------------
-- Commerce is the things a buyer transacts over: the catalog, the shelf it is
-- arranged on, the discounts against it, the quote that offers it and the
-- return that brings it back. Finances is what falls out of that: the bill,
-- the account it lands on, and who you buy from.
--
-- What deliberately STAYS in Tools: billables (a fee schedule is what you
-- charge for, not a thing you ship), quick plans (bundles of those) and the
-- whiteboard. What stays in CRM: the parties and the records about them.

update public.features set category = 'commerce' where id in
	('products', 'proposals', 'rmas', 'featured-groups', 'coupons');

update public.features set category = 'finances' where id in
	('invoices', 'ledger', 'suppliers');

-- The assistant works the records, so it belongs with them rather than in the
-- shell section above them.
update public.features set category = 'crm' where id = 'assistant';

-- Positions inside each section, for every vertical that does not set its own
-- (the industry_feature_order convention: multiples of 100, restarting at 100
-- per category).
update public.features as f
set sort_order = v.sort_order
from (values
	-- CRM — the assistant arrives at the top of the records it works. A tie
	-- with the calendar breaks by label in `buildNav()`, so it needs no number
	-- of its own below 100, which is reserved for the static shell entries.
	('assistant', 100),

	-- Commerce — what you sell, how it is shelved and priced, then the
	-- documents that move it.
	('products', 100),
	('featured-groups', 200),
	('coupons', 300),
	('proposals', 400),
	('rmas', 500),

	-- Finances — the bill, the account, then who you buy from.
	('invoices', 100),
	('ledger', 200),
	('suppliers', 300)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Medical supplies: its own words and its own order
-- ---------------------------------------------------------------------------
-- A distributor's sidebar, in the order of the work: the day, then the
-- accounts you sell to, then the catalog and the documents that move it, then
-- the money. The words are the ones a distributor uses — a company is a
-- client, a product is the catalog, a proposal is a quote, the ledger is the
-- financial picture, a supplier is a vendor.
--
-- `noun` is lower case by constraint: it is the word a sentence uses ("3
-- clients"), never a heading.

update public.industry_features as f
set name = v.name, noun = v.noun
from (values
	-- The day you open on. Not a renamed calendar so much as the question it
	-- answers first thing: what is happening today.
	('calendar', 'Today', 'day'),
	('companies', 'Clients', 'client'),
	('products', 'Catalog', 'catalog item'),
	('ledger', 'Financials', null),
	('suppliers', 'Vendors', 'vendor')
) as v (feature_id, name, noun)
where f.industry_id = 'medical-supplies' and f.feature_id = v.feature_id;

-- The order. The features this vertical includes but that a supply platform's
-- sidebar does not lead with — contacts, deals, assets, tickets, the graph,
-- the fee schedule — keep their place behind the ones it does, rather than
-- being dropped: they are working pages with rows behind them, and hiding a
-- feature makes its pages 404.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	-- CRM
	('calendar', 100),
	('assistant', 200),
	('companies', 300),
	('tasks', 400),
	('contacts', 500),
	('deals', 600),
	('assets', 700),
	('tickets', 800),
	('graph', 900),

	-- Commerce
	('products', 100),
	('rmas', 200),
	('proposals', 300),
	('featured-groups', 400),
	('coupons', 500),

	-- Tools — what this vertical charges for, and the scratch surface.
	('billables', 100),
	('quick-plans', 200),
	('whiteboard', 300),

	-- Finances
	('ledger', 100),
	('invoices', 200),
	('suppliers', 300)
) as v (feature_id, sort_order)
where f.industry_id = 'medical-supplies' and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- What a supply platform's sidebar has that this one cannot show yet
-- ---------------------------------------------------------------------------
-- Orders, Shipments, Categories, Purchases, Insights and an image generator
-- are all part of the picture and none of them is a row away. Orders,
-- shipments, purchases and product categories have TABLES (the
-- orders_and_shipments, vendors_and_purchasing and product_catalog
-- migrations) but no routes, and a `features` row without a route is a
-- sidebar entry that 404s — the feature gate serves a registered route, it
-- does not invent one. Insights and the image generator have neither.
--
-- They arrive with their pages, the way every other feature here did: the
-- route under src/routes/(app)/, then the migration inserting its `features`
-- and `pages` rows, its `industry_features` and `tier_features` rows, and its
-- id in FEATURE_IDS. Registering them early to fill the sidebar would trade a
-- missing entry for a broken one.
