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

-- Every vertical has people, and every one of them sells something it would
-- rather not retype — a dental procedure, a roofing material, a case of beer.
-- So both features go to the whole catalog, derived rather than listed: the
-- statement is the intent, and an industry added later cannot silently miss
-- them. (`hidden` keeps plenty of fixtures from the industry_role_catalog
-- migration — cosmetic has no ticket queue, dentistry no deal pipeline.)
insert into public.industry_features (industry_id, feature_id)
select i.id, f.feature_id
from public.industries i
cross join (values ('contacts'), ('products')) as f (feature_id)
on conflict (industry_id, feature_id) do nothing;

-- Contacts ships in every plan: a CRM whose free tier cannot store a person is
-- not a CRM. The catalog is the paid step up, so `products` starts at pro —
-- which also gives every free-tier org a locked_visible entry to upsell from,
-- the state `deals` already demonstrates.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'contacts'),
	('pro', 'contacts'),
	('pro', 'products'),
	('enterprise', 'contacts'),
	('enterprise', 'products')
on conflict (tier_id, feature_id) do nothing;

-- Contacts inherit the authority a role already held over companies, and that
-- is not a convenience — it is what keeps the reshape from quietly changing
-- who can do what. People used to be `client_contacts`, reachable only through
-- the client they hung off and carrying no grant of their own, so whatever a
-- role could do to a client it could already do to the people inside it.
-- Deriving preserves that exactly, for every role in every industry, including
-- ones added after this migration was written.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'contacts', rp.level
from public.role_permissions rp
where rp.feature_id = 'companies'
on conflict (role_id, feature_id) do nothing;

-- The catalog is a genuinely new capability nobody held before, so it goes to
-- the whole-industry ladder rungs only — a specialist gets it when its
-- industry decides it should, not by default. The ladder is listed the way the
-- industry_role_catalog migration lists it, and joined to industry_features so
-- an industry that lacks the feature grants nothing; that migration's own
-- closing note says a feature added later still needs its grants, and this is
-- them.
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
join public.industry_features f
	on f.industry_id = ladder.industry_id and f.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;
