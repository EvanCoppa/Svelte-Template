-- Views: a query with a page.
--
-- "Vendors" is the companies whose relationship is supplier. "Patient map" is
-- the people who belong to no company, on a map. Each is a list page that
-- differs from Companies or Contacts only in WHICH rows it shows, what
-- columns, and whether they are drawn as a table or as pins — so each is a
-- row here, not a route: the one page at src/routes/(app)/views/[view=view]/
-- renders every view, and an industry gets a new page by inserting rows.
--
-- A view IS a feature. Its id is a features row whose route is
-- `/views/<id>`, and that row is what gives it everything a page needs with
-- no code of its own: a sidebar entry and a ⌘K hit (the nav renders from the
-- registry), the gate in hooks.server.ts, a title (its pages row), the
-- industries that have it and what each calls it (industry_features — a
-- CRM says "Vendors", a roofer "Suppliers"), the plans that unlock it
-- (tier_features) and who may read it (role_permissions). This table adds
-- only the DEFINITION:
--
--   source          which kind of record it lists (a party: both have addresses)
--   filter          which of them, as JSON — the shape is src/lib/views/filter.ts,
--                   validated on every load so a bad row fails loudly
--   columns         which of the source's columns it shows (src/lib/views/columns.ts);
--                   `name` always leads, as the link into the record
--   layouts         table, map, or both; default_layout is the one it opens on
--
-- Reference data owned by migrations, like features and pages: a member
-- cannot write one. Per-org saved views — a row a member writes — are a
-- deliberate later extension that will reuse this filter shape in a tenant
-- table of its own; nothing here needs to change for that.

create table public.views (
	id text not null primary key references public.features (id) on delete cascade,
	source public.crm_entity_type not null,
	filter jsonb not null default '{"where": []}'::jsonb,
	columns text[] not null,
	layouts text[] not null default '{table}',
	default_layout text not null default 'table',
	created_at timestamptz not null default now(),
	constraint views_source_is_party check (source in ('company', 'contact')),
	constraint views_has_columns check (cardinality(columns) > 0),
	constraint views_layouts_known check (
		cardinality(layouts) > 0 and layouts <@ array['table', 'map']::text[]
	),
	constraint views_default_layout_offered check (default_layout = any (layouts))
);

comment on table public.views is
	'A saved query with a page: which kind of record, which of them (a JSON filter, validated by src/lib/views/filter.ts), which columns, and whether they render as a table, a map, or both. The id is a features row at /views/<id>. Reference data owned by migrations; clients only read it.';

-- ---------------------------------------------------------------------------
-- The rows: three views, one per mechanism worth proving
-- ---------------------------------------------------------------------------
--   suppliers         a company view with a map, named per industry
--   partner-contacts  a contact view whose filter hops through the company
--   patient-map       a contact view that opens on the map

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('suppliers', 'Suppliers', 'supplier',
		'The companies you buy from, as a list and on a map.',
		'/views/suppliers', 'truck', 'crm', 12),
	('partner-contacts', 'Partner contacts', 'contact',
		'The people at the companies you partner with.',
		'/views/partner-contacts', 'handshake', 'crm', 17),
	('patient-map', 'Patient map', 'patient',
		'Where your patients are, on a map.',
		'/views/patient-map', 'map-pin', 'crm', 18)
on conflict (id) do nothing;

insert into public.views (id, source, filter, columns, layouts, default_layout) values
	('suppliers', 'company',
		'{"where": [{"field": "relationship", "op": "in", "values": ["supplier"]}]}',
		'{name,status,email,phone,city}', '{table,map}', 'table'),
	('partner-contacts', 'contact',
		'{"where": [{"field": "company.relationship", "op": "in", "values": ["partner"]}]}',
		'{name,company,title,email,status}', '{table}', 'table'),
	('patient-map', 'contact',
		'{"where": [{"field": "has_company", "op": "eq", "value": false}]}',
		'{name,phone,email,status,city}', '{map,table}', 'map')
on conflict (id) do nothing;

-- No title of their own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('view-suppliers', 'suppliers', '/views/suppliers', null),
	('view-partner-contacts', 'partner-contacts', '/views/partner-contacts', null),
	('view-patient-map', 'patient-map', '/views/patient-map', null)
on conflict (id) do nothing;

-- Which industries have each view, and what they call it (null inherits the
-- feature's words). A practice has no vendors page and a roofer no patient
-- map: `hidden` is the row not being here.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'suppliers', 'Vendors', 'vendor'),
	('roofing', 'suppliers', null, null),
	('medical-supplies', 'suppliers', null, null),
	('beverage', 'suppliers', null, null),
	('crm', 'partner-contacts', null, null),
	('dentistry', 'patient-map', null, null)
on conflict (industry_id, feature_id) do nothing;

-- A view costs nothing to serve, so every plan has them; locking one behind
-- a plan is a product choice a later row can make.
insert into public.tier_features (tier_id, feature_id)
select t.id, v.id
from public.tiers t
cross join public.views v
on conflict (tier_id, feature_id) do nothing;

-- Whoever may read the source may read the view of it — derived, the way
-- contacts inherited companies. A view is read-only: adding a record from it
-- is the source feature's `manage`, checked by the generic create action.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, v.id, 'read'::public.permission_level
from public.views v
join public.role_permissions rp
	on rp.feature_id = case v.source when 'company' then 'companies' when 'contact' then 'contacts' end
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.views enable row level security;

-- Reference data, like the feature registry: readable by every signed-in
-- user, select-only — no write policies, so only migrations / the service
-- role change it.
create policy "Authenticated users can read the view registry"
	on public.views for select to authenticated
	using (true);

revoke insert, update on table public.views from authenticated;

-- ---------------------------------------------------------------------------
-- How to add a view
-- ---------------------------------------------------------------------------
-- 1. Insert its features row (id, name, noun — a view always names one row —
--    description, route = '/views/<id>', icon, category, sort_order), the
--    industry_features rows for every industry that has it (with the
--    industry's own name/noun where it differs), its tier_features rows, and
--    its role_permissions at `read`, derived from the source feature as above.
-- 2. Insert its views row: source, the filter (src/lib/views/filter.ts says
--    what a condition may be), the column keys (src/lib/views/columns.ts),
--    the layouts and the one it opens on.
-- 3. Insert its pages row ('view-<id>', '<id>', '/views/<id>', null).
-- 4. Add the id to FEATURE_IDS in src/lib/features/types.ts and make sure the
--    icon slug is in src/lib/features/icons.ts.
-- 5. npm run db:types, commit the regenerated src/lib/database.types.ts.
-- No route and no nav edit: the one page renders every view.
