-- Proposals: the list and record pages for the decision every vertical shares
-- (docs/proposals.md), registered like every other feature — and the first
-- feature named by its industry: a CRM sends proposals, a roofer and a
-- distributor send quotes, a dentist and a beauty studio present treatment
-- plans. The tables exist since the proposals migration; these rows make
-- /proposals exist for an org.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('proposals', 'Proposals', 'proposal',
		'Priced options laid side by side for a client to choose from.',
		'/proposals', 'file-text', 'platform', 22)
on conflict (id) do nothing;

-- No title of its own: the page is named by its feature, as the org's
-- industry says it (the feature_names_by_industry migration).
insert into public.pages (id, feature_id, path, title) values
	('proposals', 'proposals', '/proposals', null)
on conflict (id) do nothing;

-- Every industry ends in the same decision, so every industry has it. Listed
-- rather than derived because each row carries the industry's own words; an
-- industry added later adds its row here with its own (the catalog
-- migration's checklist). Null inherits "Proposals" / "proposal".
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'proposals', null, null),
	('roofing', 'proposals', 'Quotes', 'quote'),
	('medical-supplies', 'proposals', 'Quotes', 'quote'),
	('cosmetic', 'proposals', 'Treatment plans', 'treatment plan'),
	('dentistry', 'proposals', 'Treatment plans', 'treatment plan'),
	('beverage', 'proposals', null, null)
on conflict (industry_id, feature_id) do nothing;

-- Every plan, like contacts: the decision is the product's reason to exist,
-- so a Free org never sees it locked.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'proposals'),
	('pro', 'proposals'),
	('enterprise', 'proposals')
on conflict (tier_id, feature_id) do nothing;

-- The ladder rungs, derived through the industry_features join exactly as the
-- catalog and the CRM feature registry do.
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
	on f.industry_id = ladder.industry_id and f.feature_id = 'proposals'
on conflict (role_id, feature_id) do nothing;

-- Specialists: a proposal is what a deal turns into, so whoever a role lets
-- work deals may work proposals at the same level — derived, the way contacts
-- inherited companies. Reaches medical-supplies Sales Rep, cosmetic Beauty
-- Advisor (read) and Account Executive, beverage Route Sales Rep.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'proposals', rp.level
from public.role_permissions rp
where rp.feature_id = 'deals'
on conflict (role_id, feature_id) do nothing;

-- Two industries have no deal pipeline at all, so the derivation reaches none
-- of their specialists — and they are the ones whose front line works from
-- the document. Listed explicitly, read-only.
insert into public.role_permissions (role_id, feature_id, level) values
	-- dentistry / Front Desk, Hygienist
	('b0000000-0000-0000-0005-000000000002', 'proposals', 'read'),
	('b0000000-0000-0000-0005-000000000003', 'proposals', 'read'),
	-- roofing / Crew Lead
	('b0000000-0000-0000-0002-000000000002', 'proposals', 'read')
on conflict (role_id, feature_id) do nothing;
