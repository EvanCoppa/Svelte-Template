-- Categories: the catalog tree gets a page
-- ===========================================================================
-- `product_categories` has existed since the product_catalog migration and
-- has never had a screen: an org's tree could only be shaped in SQL, while
-- every product's list row already showed the category it sits in. This
-- registers the feature and its two pages.
--
-- No table changes. The tree, its RLS (members read, owner/admin write), its
-- cascade and its cycle-preventing trigger are all already there — this is
-- the registry half that migration deliberately left for the route.
--
-- A CATEGORY IS NOT A RECORD KIND, on purpose. It has no `crm_entity_type`
-- value, so nothing tags, notes, relates to or attaches a custom field to
-- one, and it gets no row on the generic record page. It is reference data
-- the org shapes — the `pipelines` and `quick_plans` shape — and it has its
-- own two screens instead: the tree, and one category with what is filed in
-- it. That is why there are no `list_fields` rows either: a tree is not a
-- table, and the generic list toolbar has nothing to say about one.

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Commerce with the catalog it organises, immediately after it:
-- you look at what you sell, then at how it is arranged.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('categories', 'Categories', 'category',
		'The tree your catalog is browsed by — what sits under what, and how much is in each.',
		'/categories', 'grid-3x3', 'commerce', 150)
on conflict (id) do nothing;

-- Two pages: the tree, and one category. The second has no title of its own —
-- it is named after the category, the record-title exception the pages
-- migration describes, and its load returns `title`.
insert into public.pages (id, feature_id, path, title) values
	('categories', 'categories', '/categories', null)
on conflict (id) do nothing;

-- The verticals that sell off a catalog — the same three that have the rest
-- of Commerce. A practice's procedures are not browsed by a tree.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'categories', null, null),
	('medical-supplies', 'categories', null, null),
	('beverage', 'categories', null, null)
on conflict (industry_id, feature_id) do nothing;

-- Every plan: a catalog you cannot organise is a list.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'categories'),
	('pro', 'categories'),
	('enterprise', 'categories')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets keep the catalog may arrange it, at the same level —
-- derived from products, the way featured groups and coupons were.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'categories', rp.level
from public.role_permissions rp
where rp.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;

-- Medical supplies puts it where the reference sidebar does: straight after
-- the catalog, ahead of the documents that move it. The vertical orders its
-- whole Commerce section itself (the commerce_and_finances_sections
-- migration), so the newcomer needs a place in it.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('medical-supplies', 'categories', 150)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- Adding a feature over a table that already exists
-- ---------------------------------------------------------------------------
--   1. The route(s) under src/routes/(app)/ — a feature with no route is a
--      sidebar entry that 404s.
--   2. This file: `features` + `pages` rows, `industry_features` for every
--      vertical that has it, `tier_features` for every plan, and
--      `role_permissions` derived from the feature whose readers should get
--      it. Plus an industry's own position where that vertical orders its
--      own section.
--   3. The id in FEATURE_IDS (src/lib/features/types.ts).
--   4. A `$lib/server/crm/` module — loads and actions never touch `.from()`.
--
-- Next: npm run db:reset, then npm run db:types and commit the regenerated
-- src/lib/database.types.ts.
