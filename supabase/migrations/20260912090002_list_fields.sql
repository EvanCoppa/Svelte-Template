-- A list is its fields, and the industry chooses them.
--
-- Every list page draws a table with a toolbar over it — a search box and
-- a filter per column worth filtering — and which columns those are is not a
-- fact about the code. A distributor's Assets page is a page of terminals
-- with a serial number and a location the org declared as custom fields; a
-- merchant-services book of companies leads with each merchant's MID and is
-- filtered by its MCC. Neither column exists in `assets` or `companies`, and
-- the page cannot know about them — so the columns, the search and the
-- filters are ROWS, resolved per industry the way a feature's name and its
-- sidebar position already are.
--
--   list_fields             the default fields of a list, keyed by the
--                           feature that owns the list page (a kind's own
--                           feature — `assets` — or a view's id)
--   industry_list_fields    an industry's own say on a field: null inherits
--                           column by column, exactly as industry_features
--                           does for name / noun / sort_order, and a row
--                           for a field the defaults do not list ADDS it
--
-- A field is a key from the kind's catalog (src/lib/lists/catalog.ts:
-- `status`, `city`, `company`) — the built-in columns. An org's custom fields
-- are columns of the list too, but they are not named here: a custom field
-- definition carries its own list flags (the industry_custom_fields
-- migration), and the industry ships the definitions themselves.
--
-- Three booleans, one meaning each:
--   shown        a column on the table (hidden fields still search / filter)
--   searchable   the search box matches against it
--   filterable   the toolbar offers a multi-select of its values
-- and `sort_order`, multiples of 100 restarting at 100 per list, the
-- nav_sort_order convention. `name` is every list's first column and the
-- link into the record, whatever the rows say; a row may still set its
-- searchability.
--
-- A view's columns were a column on its own row (`views.columns`). They are
-- these rows now — a view IS a feature, so its list is keyed like any other —
-- and that column goes, so a column is declared in exactly one place.
--
-- Reference data owned by migrations, select-only for clients, like features
-- and pages. Per-org saved column sets are a later phase and would be a tenant
-- table of the same shape resolved after these.

create table public.list_fields (
	feature_id text not null references public.features (id) on delete cascade,
	field text not null,
	-- A heading of its own; null is the catalog's (or the custom definition's).
	label text,
	shown boolean not null default true,
	searchable boolean not null default false,
	filterable boolean not null default false,
	sort_order integer not null,
	created_at timestamptz not null default now(),
	primary key (feature_id, field),
	constraint list_fields_field_is_key check (field ~ '^[a-z][a-z0-9_]*$'),
	constraint list_fields_label_not_blank check (label is null or length(trim(label)) > 0),
	constraint list_fields_sort_order_positive check (sort_order > 0)
);

comment on table public.list_fields is
	'The default built-in fields of a list page, keyed by the feature that owns it: a catalog key, whether it is shown as a column, searched by the search box, offered as a filter, and where it sits. Resolved per industry with industry_list_fields by src/lib/lists/resolve.ts. Reference data owned by migrations.';

create table public.industry_list_fields (
	industry_id text not null references public.industries (id) on delete cascade,
	feature_id text not null references public.features (id) on delete cascade,
	field text not null,
	-- Every column nullable: null inherits the default row's value, and a row
	-- for a field with no default row adds the field, reading what it leaves
	-- null as a default row would (shown, not searched, not filtered, last).
	label text,
	shown boolean,
	searchable boolean,
	filterable boolean,
	sort_order integer,
	created_at timestamptz not null default now(),
	primary key (industry_id, feature_id, field),
	constraint industry_list_fields_field_is_key check (field ~ '^[a-z][a-z0-9_]*$'),
	constraint industry_list_fields_label_not_blank check (label is null or length(trim(label)) > 0),
	constraint industry_list_fields_sort_order_positive check (sort_order is null or sort_order > 0)
);

comment on table public.industry_list_fields is
	'An industry''s own say on one field of one list — null inherits list_fields column by column, and a row for a field the defaults do not list adds it. How a vertical puts its custom fields on a table and in the filters.';

create index industry_list_fields_feature_id_idx on public.industry_list_fields (feature_id);

-- ---------------------------------------------------------------------------
-- The defaults: every list page's columns as they were drawn in code
-- ---------------------------------------------------------------------------
-- `name` first and searchable everywhere; the enum columns filterable; the
-- contact channels searchable, some of them hidden so the box still finds a
-- phone number without the table growing a column for it.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('companies', 'name', true, true, false, 100),
	('companies', 'relationship', true, false, true, 200),
	('companies', 'email', true, true, false, 300),
	('companies', 'website', true, true, false, 400),
	('companies', 'status', true, false, true, 500),
	('companies', 'phone', false, true, false, 600),
	('companies', 'city', false, true, true, 700),
	('companies', 'created_at', false, false, false, 800),

	('contacts', 'name', true, true, false, 100),
	('contacts', 'company', true, true, true, 200),
	('contacts', 'title', true, true, false, 300),
	('contacts', 'email', true, true, false, 400),
	('contacts', 'status', true, false, true, 500),
	('contacts', 'phone', false, true, false, 600),
	('contacts', 'city', false, true, true, 700),
	('contacts', 'created_at', false, false, false, 800),

	('assets', 'name', true, true, false, 100),
	('assets', 'asset_type', true, false, true, 200),
	('assets', 'identifier', true, true, false, 300),
	('assets', 'acquired_on', true, false, false, 400),
	('assets', 'purchase_price', true, false, false, 500),
	('assets', 'status', true, false, true, 600),
	('assets', 'disposed_on', false, false, false, 700),
	('assets', 'created_at', false, false, false, 800),

	('products', 'name', true, true, false, 100),
	('products', 'kind', true, false, true, 200),
	('products', 'category', true, true, true, 300),
	('products', 'sku', true, true, false, 400),
	('products', 'unit_price', true, false, false, 500),
	('products', 'quantity_on_hand', true, false, false, 600),
	('products', 'created_at', false, false, false, 700),

	('deals', 'name', true, true, false, 100),
	('deals', 'company', true, true, true, 200),
	('deals', 'contact', true, true, true, 300),
	('deals', 'stage', true, false, true, 400),
	('deals', 'amount', true, false, false, 500),
	('deals', 'expected_close_date', true, false, false, 600),
	('deals', 'created_at', false, false, false, 700),

	('tickets', 'number', true, true, false, 100),
	('tickets', 'name', true, true, false, 200),
	('tickets', 'company', true, true, true, 300),
	('tickets', 'contact', true, true, true, 400),
	('tickets', 'status', true, false, true, 500),
	('tickets', 'priority', true, false, true, 600),
	('tickets', 'created_at', false, false, false, 700),

	('invoices', 'name', true, true, false, 100),
	('invoices', 'company', true, true, true, 200),
	('invoices', 'contact', true, true, true, 300),
	('invoices', 'status', true, false, true, 400),
	('invoices', 'payment', true, false, true, 500),
	('invoices', 'total', true, false, false, 600),
	('invoices', 'balance', true, false, false, 700),
	('invoices', 'due_date', true, false, false, 800),
	('invoices', 'created_at', false, false, false, 900),

	('proposals', 'name', true, true, false, 100),
	('proposals', 'status', true, false, true, 200),
	('proposals', 'options', true, false, false, 300),
	('proposals', 'recommended', true, false, false, 400),
	('proposals', 'valid_until', true, false, false, 500),
	('proposals', 'created_at', true, false, false, 600),

	('billables', 'name', true, true, false, 100),
	('billables', 'code', true, true, false, 200),
	('billables', 'unit_price', true, false, false, 300),
	('billables', 'unit_choices', true, false, false, 400),
	('billables', 'is_featured', true, false, true, 500),
	('billables', 'status', true, false, true, 600),
	('billables', 'created_at', false, false, false, 700)
on conflict (feature_id, field) do nothing;

-- The views, exactly the columns their rows carried, now as rows here.
insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('suppliers', 'name', true, true, false, 100),
	('suppliers', 'status', true, false, true, 200),
	('suppliers', 'email', true, true, false, 300),
	('suppliers', 'phone', true, true, false, 400),
	('suppliers', 'city', true, true, true, 500),

	('partner-contacts', 'name', true, true, false, 100),
	('partner-contacts', 'company', true, true, true, 200),
	('partner-contacts', 'title', true, true, false, 300),
	('partner-contacts', 'email', true, true, false, 400),
	('partner-contacts', 'status', true, false, true, 500),

	('patient-map', 'name', true, true, false, 100),
	('patient-map', 'phone', true, true, false, 200),
	('patient-map', 'email', true, true, false, 300),
	('patient-map', 'status', true, false, true, 400),
	('patient-map', 'city', true, true, true, 500),

	('merchant-map', 'name', true, true, false, 100),
	('merchant-map', 'status', true, false, true, 200),
	('merchant-map', 'phone', true, true, false, 300),
	('merchant-map', 'email', true, true, false, 400),
	('merchant-map', 'city', true, true, true, 500),

	('prospects', 'name', true, true, false, 100),
	('prospects', 'status', true, false, true, 200),
	('prospects', 'phone', true, true, false, 300),
	('prospects', 'email', true, true, false, 400),
	('prospects', 'city', true, true, true, 500),

	('referral-partners', 'name', true, true, false, 100),
	('referral-partners', 'status', true, false, true, 200),
	('referral-partners', 'email', true, true, false, 300),
	('referral-partners', 'phone', true, true, false, 400),
	('referral-partners', 'city', true, true, true, 500)
on conflict (feature_id, field) do nothing;

alter table public.views drop constraint views_has_columns;
alter table public.views drop column columns;

comment on table public.views is
	'A saved query with a page: which kind of record, which of them (a JSON filter, validated by src/lib/views/filter.ts), and whether they render as a table, a map, or both. Its columns are its list_fields rows, keyed by the view''s id. The id is a features row at /views/<id>. Reference data owned by migrations; clients only read it.';

-- ---------------------------------------------------------------------------
-- The industries whose lists are not the default
-- ---------------------------------------------------------------------------
-- Merchant services: the relationship is always `customer` in this book, so
-- the column earns nothing. Beverage: assets are out in the field — a tap, a
-- cooler, a keg — and what one cost matters less than where it is. (The
-- custom columns those verticals add — MID, MCC, location, serial number —
-- are the industry's custom fields, in the industry_custom_fields migration.)
insert into public.industry_list_fields (industry_id, feature_id, field, shown, searchable, filterable, sort_order) values
	('merchant-services', 'companies', 'relationship', false, null, false, null),
	('beverage', 'assets', 'purchase_price', false, null, null, null)
on conflict (industry_id, feature_id, field) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.list_fields enable row level security;
alter table public.industry_list_fields enable row level security;

create policy "Authenticated users can read the list field registry"
	on public.list_fields for select to authenticated
	using (true);

create policy "Authenticated users can read the industry list fields"
	on public.industry_list_fields for select to authenticated
	using (true);

revoke insert, update on table public.list_fields from authenticated;
revoke insert, update on table public.industry_list_fields from authenticated;

-- ---------------------------------------------------------------------------
-- Putting a field on a list, after this
-- ---------------------------------------------------------------------------
-- A built-in column: make sure the kind's catalog (src/lib/lists/catalog.ts)
-- has the key and the describer (src/lib/server/crm/lists.ts) fills it, then
-- insert its list_fields row. An industry that wants a built-in column
-- hidden, or searchable, sets only that column on its row and leaves the
-- rest null to inherit. A custom field is never named here: its definition
-- says how it sits on the list (the industry_custom_fields migration).
-- Nothing here is per org: an org that wants its own built-in column set asks
-- for a migration, like a feature's name.
