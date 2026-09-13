-- The industry axis custom fields never got
-- ===========================================================================
-- Every industry-shaped thing in this codebase is a default plus an
-- industry's own, null inheriting: `features`/`industry_features` for a
-- feature's name, noun and sidebar position, `terms`/`industry_terms` for the
-- words that belong to no feature. Custom fields stopped at per-org —
-- `custom_field_definitions.org_id` is `not null` and members write it — so
-- there has been no way for a vertical to ship the attributes it obviously
-- needs. A new roofing org starts with a blank Custom fields panel and
-- nowhere to put "how many squares is this roof".
--
-- This adds the axis, and the shape it takes is deliberately NOT the one
-- names and order use. Those resolve at read time, because nobody edits a
-- feature's name. An org absolutely does edit its own fields — renames one,
-- drops the one it does not use, adds three of its own — and a value has to
-- reference a real `custom_field_definitions` row, which an industry row is
-- not. So `industry_custom_fields` holds TEMPLATES, and they are COPIED into
-- an org's own definitions when it joins the industry:
--
--   * the org owns its copies from the first moment, so editing one needs no
--     new concept and no "is this inherited?" state on the screen
--   * `custom_field_values` is untouched — it still points at a definition
--     that belongs to the same org, as its composite keys require
--   * nothing in src/ changes. By the time any load runs they are ordinary
--     definitions
--
-- The copy is idempotent on `(org_id, entity_type, key)`, which is what makes
-- an org that CHANGES industry gain the new vertical's fields while keeping
-- everything it already had, including its own edits.

-- ---------------------------------------------------------------------------
-- Definitions gain an order
-- ---------------------------------------------------------------------------

-- `listCustomFields()` ordered by label, which is the right default for a
-- handful of fields an org typed in itself and the wrong one for a shipped
-- set: roofing's eleven insurance fields read as a form, and alphabetical
-- interleaves them with the permit and the dumpster. Nullable, so a field
-- nobody positioned still sorts by label behind the ones that are — the
-- null-inherits rule this codebase uses everywhere.
alter table public.custom_field_definitions
	add column sort_order integer
		constraint custom_field_definitions_sort_order_positive
		check (sort_order is null or sort_order > 0);

comment on column public.custom_field_definitions.sort_order is
	'Where this field sits among its kind''s fields, or null to sort by label behind those that are positioned. Multiples of 100 (see the nav_sort_order migration).';

-- ---------------------------------------------------------------------------
-- industry_custom_fields
-- ---------------------------------------------------------------------------

-- Reference data owned by migrations, like `features`, `tiers` and `views`:
-- readable by every signed-in user, written only by a migration or the
-- service role. The column list is `custom_field_definitions` minus `org_id`
-- plus `industry_id`, and the three checks are copied verbatim rather than
-- relaxed — a template that could not be inserted as a definition would fail
-- at copy time, on somebody's signup, which is the worst possible moment to
-- find out.
create table public.industry_custom_fields (
	id uuid not null primary key default gen_random_uuid(),
	industry_id text not null references public.industries (id) on delete cascade,
	entity_type public.crm_entity_type not null,
	key text not null,
	label text not null,
	value_type public.custom_field_value_type not null,
	allowed_values jsonb,
	sort_order integer,
	created_at timestamptz not null default now(),
	unique (industry_id, entity_type, key),
	constraint industry_custom_fields_key_is_snake_case
		check (key ~ '^[a-z][a-z0-9_]*$'),
	constraint industry_custom_fields_allowed_values_for_select_only
		check ((value_type = 'select'::public.custom_field_value_type) = (allowed_values is not null)),
	constraint industry_custom_fields_allowed_values_are_strings
		check (allowed_values is null or
			(private.jsonb_is_string_array(allowed_values) and jsonb_array_length(allowed_values) > 0)),
	constraint industry_custom_fields_sort_order_positive
		check (sort_order is null or sort_order > 0)
);

comment on table public.industry_custom_fields is
	'A typed attribute a vertical ships: copied into an organization''s own custom_field_definitions when it joins the industry, and owned by the org from then on. Reference data; clients only read it.';

create index industry_custom_fields_industry_id_idx
	on public.industry_custom_fields (industry_id, entity_type, sort_order);

-- ---------------------------------------------------------------------------
-- The copy
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the same reason create_default_pipeline is: it runs as
-- whoever inserted the org, who has no policy on these tables yet. Returns
-- the number of definitions actually created, so the backfill below and any
-- future caller can say what happened rather than guess.
create function public.apply_industry_custom_fields(org uuid, industry text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	created integer;
begin
	insert into public.custom_field_definitions
		(org_id, entity_type, key, label, value_type, allowed_values, sort_order)
	select org, t.entity_type, t.key, t.label, t.value_type, t.allowed_values, t.sort_order
	from public.industry_custom_fields t
	where t.industry_id = industry
	-- The org's own row always wins: a key it already has is one it named,
	-- renamed or kept on purpose, and the template must not overwrite it.
	on conflict (org_id, entity_type, key) do nothing;

	get diagnostics created = row_count;
	return created;
end;
$$;

comment on function public.apply_industry_custom_fields(uuid, text) is
	'Copy an industry''s field templates into an organization''s own definitions. Idempotent: a key the org already has is left exactly as the org has it.';

create function public.handle_organization_industry_custom_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.apply_industry_custom_fields(new.id, new.industry_id);
	return new;
end;
$$;

create trigger on_organization_created_custom_fields
	after insert on public.organizations
	for each row execute procedure public.handle_organization_industry_custom_fields();

-- An org's industry is set by onboarding / service-role code and can change
-- after creation (it is never written from the browser). When it does, the
-- org gains the new vertical's fields and keeps everything it already had —
-- the conflict clause above is the whole of that behaviour. Nothing is
-- removed: a field with values in it is the org's data, not the old
-- industry's, and deleting it would delete those values by cascade.
create trigger on_organization_industry_changed_custom_fields
	after update of industry_id on public.organizations
	for each row
	when (old.industry_id is distinct from new.industry_id)
	execute procedure public.handle_organization_industry_custom_fields();

-- Backfill: every org that already exists. Idempotent by the same conflict
-- clause, so a re-apply creates nothing.
do $$
declare
	org record;
begin
	for org in select o.id, o.industry_id from public.organizations o
	loop
		perform public.apply_industry_custom_fields(org.id, org.industry_id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.industry_custom_fields enable row level security;

-- Reference data, like the feature and view registries: readable by every
-- signed-in user, select-only — no write policies, so only migrations and the
-- service role change it.
create policy "Authenticated users can read industry custom fields"
	on public.industry_custom_fields for select to authenticated
	using (true);

revoke insert, update, delete on table public.industry_custom_fields from authenticated;

-- ---------------------------------------------------------------------------
-- Roofing's fields
-- ---------------------------------------------------------------------------
-- The set docs/roofing.md compiled. Positions are multiples of 100,
-- restarting at 100 within each kind, so a field can be slipped between two
-- others without renumbering the rest.
--
-- One shape to note: there is no `date` value type — the enum is text,
-- numeric, boolean, select — so a date here is `text`. That is a real gap
-- (a `date` type would want a `value_date` column on custom_field_values and
-- a renderer), deliberately left to its own change rather than smuggled into
-- this one.

insert into public.industry_custom_fields (industry_id, entity_type, key, label, value_type, allowed_values, sort_order) values
	-- The homeowner. A roofer reaches a person at their house, in an order
	-- that matters: how to reach them, then what they will find on arrival.
	('roofing', 'contact', 'preferred_channel', 'Preferred channel', 'select', '["Call", "Text", "Email"]', 100),
	('roofing', 'contact', 'best_time', 'Best time to reach', 'select', '["Morning", "Afternoon", "Evening", "Weekend"]', 200),
	('roofing', 'contact', 'referral_source', 'How they found us', 'select', '["Door knock", "Storm canvass", "Referral", "Web", "Google", "Angi", "Yard sign", "Repeat customer"]', 300),
	('roofing', 'contact', 'gate_code', 'Gate code', 'text', null, 400),
	('roofing', 'contact', 'dog_on_property', 'Dog on property', 'boolean', null, 500),
	('roofing', 'contact', 'hoa_name', 'HOA', 'text', null, 600),

	-- The property. `assets` holds only universal columns by rule
	-- (docs/relationships.md), which is exactly why every measurement here is
	-- a field and not a column: the address is the entity link's and who owns
	-- it is a relationship.
	('roofing', 'asset', 'roof_squares', 'Squares', 'numeric', null, 100),
	('roofing', 'asset', 'roof_pitch', 'Pitch', 'select', '["Flat", "3/12", "4/12", "6/12", "8/12", "10/12", "12/12 or steeper"]', 200),
	('roofing', 'asset', 'stories', 'Stories', 'numeric', null, 300),
	('roofing', 'asset', 'existing_layers', 'Existing layers', 'numeric', null, 400),
	('roofing', 'asset', 'existing_material', 'Existing material', 'select', '["3-tab", "Architectural", "Wood shake", "Tile", "Metal", "Slate", "TPO", "EPDM", "Modified bitumen"]', 500),
	('roofing', 'asset', 'decking_type', 'Decking', 'select', '["OSB", "Plywood", "Plank / skip sheathing"]', 600),
	('roofing', 'asset', 'roof_age_years', 'Roof age (years)', 'numeric', null, 700),
	('roofing', 'asset', 'year_built', 'Year built', 'numeric', null, 800),
	('roofing', 'asset', 'satellite_report_url', 'Measurement report', 'text', null, 900),
	('roofing', 'asset', 'permit_jurisdiction', 'Permit jurisdiction', 'text', null, 1000),
	('roofing', 'asset', 'access_notes', 'Access notes', 'text', null, 1100),
	('roofing', 'asset', 'hoa_approval_required', 'HOA approval required', 'boolean', null, 1200),

	-- The job. Inert until `deals` is enabled for roofing (docs/roofing.md,
	-- "The Jobs decision") except on the seeded pilot that already has it —
	-- shipped now so that decision is a rename and a row, not a field audit.
	('roofing', 'deal', 'job_type', 'Job type', 'select', '["Full replacement", "Repair", "Inspection", "Maintenance", "Gutters", "Siding", "Emergency tarp"]', 100),
	('roofing', 'deal', 'lead_source', 'Lead source', 'select', '["Door knock", "Storm canvass", "Referral", "Web", "Google", "Angi", "Yard sign", "Repeat customer"]', 200),
	('roofing', 'deal', 'permit_number', 'Permit number', 'text', null, 300),
	('roofing', 'deal', 'permit_status', 'Permit status', 'select', '["Not required", "Applied", "Issued", "Inspected", "Closed"]', 400),
	('roofing', 'deal', 'material_delivery_date', 'Material delivery', 'text', null, 500),
	('roofing', 'deal', 'dumpster_ordered', 'Dumpster ordered', 'boolean', null, 600),
	('roofing', 'deal', 'final_inspection_passed', 'Final inspection passed', 'boolean', null, 700),

	-- The claim, on the same kind. Storm restoration is most of the
	-- residential market and the carrier is a second payer against the same
	-- job: the homeowner owes the deductible, the carrier owes the rest, and
	-- the depreciation is withheld until the work is done. Eleven fields is a
	-- lot for one panel, and that is the argument for Claims becoming a
	-- feature — once these prove they have outgrown being fields.
	('roofing', 'deal', 'claim_status', 'Claim status', 'select', '["Not a claim", "Filed", "Inspected", "Approved", "Denied", "Appealing", "Paid"]', 800),
	('roofing', 'deal', 'insurance_carrier', 'Carrier', 'text', null, 900),
	('roofing', 'deal', 'claim_number', 'Claim number', 'text', null, 1000),
	('roofing', 'deal', 'adjuster_name', 'Adjuster', 'text', null, 1100),
	('roofing', 'deal', 'adjuster_phone', 'Adjuster phone', 'text', null, 1200),
	('roofing', 'deal', 'date_of_loss', 'Date of loss', 'text', null, 1300),
	('roofing', 'deal', 'deductible', 'Deductible', 'numeric', null, 1400),
	('roofing', 'deal', 'acv_amount', 'ACV', 'numeric', null, 1500),
	('roofing', 'deal', 'rcv_amount', 'RCV', 'numeric', null, 1600),
	('roofing', 'deal', 'depreciation_withheld', 'Depreciation withheld', 'numeric', null, 1700),
	('roofing', 'deal', 'supplement_status', 'Supplement', 'select', '["None", "Submitted", "Approved", "Denied"]', 1800),

	-- The quote option — the kind the comparison table already renders, and
	-- where a roofer's options actually differ: same roof, three shingles,
	-- three warranties.
	('roofing', 'proposal_option', 'shingle_brand', 'Shingle brand', 'select', '["GAF", "Owens Corning", "CertainTeed", "Malarkey", "TAMKO", "Atlas"]', 100),
	('roofing', 'proposal_option', 'shingle_line', 'Shingle line', 'text', null, 200),
	('roofing', 'proposal_option', 'shingle_color', 'Color', 'text', null, 300),
	('roofing', 'proposal_option', 'manufacturer_warranty', 'Manufacturer warranty', 'select', '["Standard", "System Plus", "Golden Pledge", "Platinum", "Integrity"]', 400),
	('roofing', 'proposal_option', 'workmanship_warranty_years', 'Workmanship warranty (years)', 'numeric', null, 500),
	('roofing', 'proposal_option', 'ventilation_type', 'Ventilation', 'select', '["Ridge vent", "Box vents", "Turbine", "Power vent", "None"]', 600),
	('roofing', 'proposal_option', 'tear_off_layers', 'Layers torn off', 'numeric', null, 700),
	('roofing', 'proposal_option', 'decking_sheets_included', 'Decking sheets included', 'numeric', null, 800),
	('roofing', 'proposal_option', 'includes_gutters', 'Gutters included', 'boolean', null, 900),

	-- The commercial account, the GC and the supplier: the paperwork you
	-- cannot put a crew on a roof without.
	('roofing', 'company', 'license_number', 'License number', 'text', null, 100),
	('roofing', 'company', 'coi_expires', 'COI expires', 'text', null, 200),
	('roofing', 'company', 'w9_on_file', 'W-9 on file', 'boolean', null, 300),
	('roofing', 'company', 'account_terms', 'Terms', 'select', '["COD", "Net 15", "Net 30", "Net 60"]', 400),

	-- The callback: a roof that leaks after you left, and whether you are
	-- still on the hook for it.
	('roofing', 'ticket', 'callback_reason', 'Reason', 'select', '["Leak", "Missing shingle", "Flashing", "Gutter", "Cosmetic", "Storm damage"]', 100),
	('roofing', 'ticket', 'under_warranty', 'Under warranty', 'boolean', null, 200),
	('roofing', 'ticket', 'warranty_type', 'Warranty type', 'select', '["Workmanship", "Manufacturer", "None"]', 300)
on conflict (industry_id, entity_type, key) do nothing;

-- The rows above landed after the backfill ran, so the orgs already in this
-- industry need the copy once more. New orgs get it from the trigger.
do $$
declare
	org record;
begin
	for org in select o.id, o.industry_id from public.organizations o
	loop
		perform public.apply_industry_custom_fields(org.id, org.industry_id);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- How to give an industry its fields
-- ---------------------------------------------------------------------------
-- One insert above, in a migration: the industry, the kind of record, a
-- snake_case key, a label, a value type ('select' iff allowed_values is set)
-- and a position. Orgs already in that industry pick it up from a backfill
-- loop like the one above; new ones from the trigger. Nothing in src/ changes
-- — a template becomes an ordinary definition on the way in.
--
-- An org's own row always wins, and nothing is ever removed: a field with
-- values in it is the org's data, and dropping it would cascade those values
-- away. Retiring a template is deleting the row here, which stops it reaching
-- the next org and leaves every org that has it alone.
--
-- One sharp edge, named rather than hidden: the copy is keyed on
-- (org_id, entity_type, key), so an org that DELETED one of its copies gets it
-- back the next time a migration runs the backfill loop. That is the right
-- default for the common case (a migration adding templates wants existing
-- orgs to receive them) and the wrong one for an org that deliberately threw a
-- field away. Fixing it properly means remembering which templates an org has
-- already been offered — a row per (org, template) — which is worth doing the
-- first time an org complains, and is not worth doing before that.
