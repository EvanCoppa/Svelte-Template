-- The registry rows for the CRM reshape: one feature renamed, two added, and
-- the pages that render them.
--
-- The house rule is that the migration adding a route registers it. This series
-- added several at once and they share one reshape, so their rows land together
-- here rather than scattered across five files — the set is the change.
--
--   clients → companies   the table was renamed, so the feature is too. The id
--                         is a foreign key from role_permissions,
--                         industry_features, tier_features and pages, so this
--                         is an UPDATE (cascading through those) rather than a
--                         delete and re-insert, which would silently drop every
--                         org's grants.
--   contacts              new: people are a first-class list now, not a panel
--                         inside an account.
--   products              new: the catalog.

-- ---------------------------------------------------------------------------
-- clients → companies
-- ---------------------------------------------------------------------------

-- `features.id` is referenced with `on delete cascade` from four tables; an
-- UPDATE needs the same treatment, and none of those foreign keys declared
-- `on update cascade`. Re-pointing them explicitly, in dependency order, is
-- what keeps every existing grant and every industry/tier row attached.
insert into public.features (id, name, description, route, icon, category, sort_order)
select 'companies', 'Companies', 'The organizations you work with — customers, suppliers and partners.',
	'/companies', 'building-2', 'platform', 10
on conflict (id) do nothing;

update public.role_permissions set feature_id = 'companies' where feature_id = 'clients';
update public.industry_features set feature_id = 'companies' where feature_id = 'clients';
update public.tier_features set feature_id = 'companies' where feature_id = 'clients';
update public.organization_feature_overrides set feature_id = 'companies' where feature_id = 'clients';
update public.organization_disabled_features set feature_id = 'companies' where feature_id = 'clients';
update public.pages set feature_id = 'companies', path = '/companies', title = 'Companies'
where id = 'clients';
update public.pages set id = 'companies' where id = 'clients';

delete from public.features where id = 'clients';

-- ---------------------------------------------------------------------------
-- contacts and products
-- ---------------------------------------------------------------------------

insert into public.features (id, name, description, route, icon, category, sort_order) values
	('contacts', 'Contacts',
		'Everyone you know — the people at your accounts, and the ones who are the account.',
		'/contacts', 'contact', 'platform', 15),
	('products', 'Products', 'Everything you sell — goods and services in one catalog.',
		'/products', 'package', 'platform', 25)
on conflict (id) do nothing;

insert into public.pages (id, feature_id, path, title) values
	('contacts', 'contacts', '/contacts', 'Contacts'),
	('products', 'products', '/products', 'Products')
on conflict (id) do nothing;

-- Both verticals have people. Only 'general' sells a catalog out of the box —
-- construction is the fixture proving an industry can lack a feature entirely,
-- and a roofer's materials list is a genuine example of something a vertical
-- may not want on day one. An org that needs it gets a row in
-- organization_feature_overrides, which is exactly what that table is for.
insert into public.industry_features (industry_id, feature_id) values
	('general', 'contacts'),
	('general', 'products'),
	('construction', 'contacts')
on conflict (industry_id, feature_id) do nothing;

-- Contacts ships in every plan: a CRM whose free tier cannot store a person is
-- not a CRM. The catalog is the paid step up, so `products` starts at pro —
-- which also gives the free tier a locked_visible entry to upsell from, the
-- state `deals` already demonstrates.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'contacts'),
	('pro', 'contacts'),
	('pro', 'products'),
	('enterprise', 'contacts'),
	('enterprise', 'products')
on conflict (tier_id, feature_id) do nothing;

-- The starter roles, extended to match what they already granted on clients:
-- Sales runs the accounts and the people in them, Support looks them up. Only
-- Sales touches the catalog, and only to read it — pricing is owner/admin work
-- until an org says otherwise.
insert into public.role_permissions (role_id, feature_id, level) values
	-- general / Support
	('b0000000-0000-0000-0000-000000000001', 'contacts', 'read'),
	-- general / Sales
	('b0000000-0000-0000-0000-000000000002', 'contacts', 'manage'),
	('b0000000-0000-0000-0000-000000000002', 'products', 'read'),
	-- construction / Support
	('b0000000-0000-0000-0000-000000000003', 'contacts', 'manage')
on conflict (role_id, feature_id) do nothing;
