-- Imports: one page that brings a spreadsheet in as records.
--
-- A business already keeps its catalog, its fee schedule and its client
-- list in a spreadsheet, and typing them into the "Add …" modal one at a
-- time is how a product never gets adopted. So `/import` takes a CSV or an
-- Excel file for any of the catalog-shaped kinds (companies, contacts,
-- products, billables, assets), shows every row as it would land — new, the
-- same as a record the org already has, invalid, a repeat — and writes the
-- rows the reader approves through the same insert the modal uses. One
-- page, not an "Import" button on every list: the registry in
-- src/lib/schemas/imports.ts says which kinds it takes, and what a row is
-- called comes from that kind's feature, as the industry words it.
--
-- The feature carries no table of its own: nothing about an import is kept
-- once it has run. What it needs from the registry is a route for the gate,
-- a nav entry and a page title.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('imports', 'Import', null,
		'Bring a spreadsheet in as records: preview every row, then add or overwrite.',
		'/import', 'upload', 'tools', 400)
on conflict (id) do nothing;

insert into public.pages (id, feature_id, path, title) values
	('imports', 'imports', '/import', 'Import data')
on conflict (id) do nothing;

-- Every industry has a list to bring in, and the words on the page are the
-- kinds' own ("Import patients" in a practice), so the feature itself keeps
-- its name everywhere.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'imports'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan: a catalog you cannot load is a catalog you retype.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'imports'),
	('pro', 'imports'),
	('enterprise', 'imports')
on conflict (tier_id, feature_id) do nothing;

-- Opening the page needs `read` here; importing a kind needs `manage` on
-- THAT kind's feature, checked by the action exactly as adding one record
-- is. So the page is granted to every role that may manage anything at
-- all — it lists only the kinds the member may write, and a role that can
-- manage nothing has nothing to import.
insert into public.role_permissions (role_id, feature_id, level)
select distinct rp.role_id, 'imports', 'read'::public.permission_level
from public.role_permissions rp
where rp.level in ('manage', 'delete')
on conflict (role_id, feature_id) do nothing;
