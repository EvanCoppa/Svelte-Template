-- Industries ship custom fields, and a custom field says how it sits on the list.
--
-- Custom fields were an org's rows only: a beverage distributor had to declare
-- "assets have a location" itself, and no list could count on the field
-- existing. But "a tap has a location and a serial number" is a fact about the
-- VERTICAL, the same way its roles and its names are — so the industry ships
-- the definitions, every org in it gets them, and the org adds its own on top.
--
--   industry_custom_fields          the fields an industry ships for a kind of
--                                   record: key, label, type, choices — and
--                                   how each sits on the kind's list
--   custom_field_definitions        the org's fields, as before; every one now
--                                   carries the same three list flags, so the
--                                   field itself is the one place that says
--                                   what it does on the table
--
-- The three flags, one meaning each (docs/lists.md):
--   list_shown        a column the table shows from the start; a field with
--                     it off is still a column, hidden behind the View menu
--   list_searchable   the search box matches against it
--   list_filterable   the toolbar offers a multi-select of its values — only
--                     a text, select or boolean field can (an amount has no
--                     values to pick from), which the check below enforces
-- The built-in columns keep their own rows (list_fields /
-- industry_list_fields); a custom field is never named there. The resolver
-- (src/lib/lists/resolve.ts) draws the built-ins first, then every custom
-- field of the kind in label order, each as its flags say.
--
-- Handing the fields to an org is the pipelines migration's pattern: a
-- SECURITY DEFINER function copies the industry's rows into the org's
-- definitions on insert (and when its industry changes), idempotently, and a
-- backfill covers the orgs that already exist. The copy is a starting point,
-- not a link — an org may rename a shipped field or flip its flags, and a
-- later change to the template reaches new orgs only.

-- ---------------------------------------------------------------------------
-- The flags on the org's definitions
-- ---------------------------------------------------------------------------

alter table public.custom_field_definitions
	add column list_shown boolean not null default false,
	add column list_searchable boolean not null default false,
	add column list_filterable boolean not null default false,
	add constraint custom_field_definitions_filterable_has_values
		check (not list_filterable or value_type in ('text', 'select', 'boolean'));

comment on column public.custom_field_definitions.list_shown is
	'Whether the kind''s list shows this field as a column from the start. Off keeps it a hidden column the reader can switch on.';
comment on column public.custom_field_definitions.list_searchable is
	'Whether the list''s search box matches against this field.';
comment on column public.custom_field_definitions.list_filterable is
	'Whether the list''s toolbar offers a filter on this field. Only a text, select or boolean field can be filtered.';

-- The org's own say, alongside the label.
revoke insert, update on table public.custom_field_definitions from authenticated;
grant insert (org_id, entity_type, key, label, value_type, allowed_values,
		list_shown, list_searchable, list_filterable),
	update (key, label, allowed_values, list_shown, list_searchable, list_filterable)
	on table public.custom_field_definitions to authenticated;

-- ---------------------------------------------------------------------------
-- industry_custom_fields — what an industry ships
-- ---------------------------------------------------------------------------

create table public.industry_custom_fields (
	industry_id text not null references public.industries (id) on delete cascade,
	entity_type public.crm_entity_type not null,
	key text not null,
	label text not null,
	value_type public.custom_field_value_type not null,
	allowed_values jsonb,
	list_shown boolean not null default false,
	list_searchable boolean not null default false,
	list_filterable boolean not null default false,
	created_at timestamptz not null default now(),
	primary key (industry_id, entity_type, key),
	-- The same rules the org's definitions live by.
	constraint industry_custom_fields_key_is_snake_case check (key ~ '^[a-z][a-z0-9_]*$'),
	constraint industry_custom_fields_label_not_blank check (length(trim(label)) > 0),
	constraint industry_custom_fields_allowed_values_for_select_only
		check ((value_type = 'select') = (allowed_values is not null)),
	constraint industry_custom_fields_allowed_values_are_strings
		check (allowed_values is null or (
			private.jsonb_is_string_array(allowed_values)
			and jsonb_array_length(allowed_values) > 0
		)),
	constraint industry_custom_fields_filterable_has_values
		check (not list_filterable or value_type in ('text', 'select', 'boolean'))
);

comment on table public.industry_custom_fields is
	'The custom fields an industry ships for a kind of record, copied into every org in the industry as custom_field_definitions (on creation and by backfill), with how each sits on the kind''s list. Reference data owned by migrations.';

-- ---------------------------------------------------------------------------
-- Every org in an industry gets its fields
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the reason create_default_pipeline is: the trigger runs
-- as whoever inserted the org, who has no policy on definitions yet.
-- Idempotent on (org, kind, key), so a field the org already declared — its
-- own, or a template it renamed — is left exactly as it is.
create function public.create_industry_custom_fields(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.custom_field_definitions
		(org_id, entity_type, key, label, value_type, allowed_values,
			list_shown, list_searchable, list_filterable)
	select org, f.entity_type, f.key, f.label, f.value_type, f.allowed_values,
		f.list_shown, f.list_searchable, f.list_filterable
	from public.industry_custom_fields f
	join public.organizations o on o.industry_id = f.industry_id
	where o.id = org
	on conflict (org_id, entity_type, key) do nothing;
end;
$$;

create function public.handle_organization_industry_custom_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.create_industry_custom_fields(new.id);
	return new;
end;
$$;

-- On creation, and again when an org moves to another industry: the new
-- vertical's fields join the ones it has (nothing is removed — values may
-- hang off them).
create trigger on_organization_industry_custom_fields
	after insert or update of industry_id on public.organizations
	for each row execute procedure public.handle_organization_industry_custom_fields();

-- ---------------------------------------------------------------------------
-- The fields the shipped industries carry
-- ---------------------------------------------------------------------------
-- Beverage — assets are out in the field: a tap, a cooler, a keg. Where one
-- is (a route) is what a driver filters by; what it is stamped with is what
-- the search box finds.
insert into public.industry_custom_fields
	(industry_id, entity_type, key, label, value_type, allowed_values,
		list_shown, list_searchable, list_filterable) values
	('beverage', 'asset', 'location', 'Location', 'select',
		'["Warehouse", "Route 1", "Route 2"]', true, false, true),
	('beverage', 'asset', 'serial_number', 'Serial number', 'text', null, true, true, false),

	-- Merchant services (the merchant_services_industry migration) — MID, MCC,
	-- average ticket and current processor are the four things a rep looks up
	-- about a merchant. The MID is what they search for; the MCC and the
	-- processor being displaced are what they filter by. `mid` and `mcc` are
	-- text: identifiers whose leading zeros matter.
	('merchant-services', 'company', 'mid', 'MID', 'text', null, true, true, false),
	('merchant-services', 'company', 'mcc', 'MCC', 'text', null, true, false, true),
	('merchant-services', 'company', 'average_ticket', 'Average ticket', 'numeric', null,
		true, false, false),
	('merchant-services', 'company', 'current_processor', 'Current processor', 'text', null,
		true, false, true)
on conflict (industry_id, entity_type, key) do nothing;

-- Backfill: every org that exists gets its industry's fields. Idempotent —
-- the insert skips what an org already has.
do $$
declare
	org record;
begin
	for org in select id from public.organizations loop
		perform public.create_industry_custom_fields(org.id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.industry_custom_fields enable row level security;

-- Reference data, like the feature registry: readable by every signed-in
-- user, select-only — no write policies, so only migrations / the service
-- role change it.
create policy "Authenticated users can read the industry custom fields"
	on public.industry_custom_fields for select to authenticated
	using (true);

revoke insert, update on table public.industry_custom_fields from authenticated;

-- ---------------------------------------------------------------------------
-- Giving an industry a custom field, after this
-- ---------------------------------------------------------------------------
-- Insert its industry_custom_fields row with the three list flags, and run
-- the backfill loop above for the orgs already in the industry (new orgs get
-- it by trigger). No code: the list draws every custom field of the kind
-- from its definition. An org that wants a field of its own declares a
-- definition the same way, flags included.
