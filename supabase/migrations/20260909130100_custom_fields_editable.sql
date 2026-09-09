-- Custom fields stop being read-only.
--
-- The tables have been here since the proposals migration and the generalized
-- one made them work for every kind of record, but nothing in the app could
-- declare a field or fill one in: every value in the database came from
-- seed.sql. This migration is the database half of closing that — the `date`
-- column behind the enum value the previous file added, a value a member can
-- clear, and the `pages` row for the settings screen that declares them.
--
-- The app half: /settings/custom-fields (owner/admin, like /settings/features)
-- declares definitions, and the generic record page edits values with `manage`
-- on the feature that owns the record's kind.

-- ---------------------------------------------------------------------------
-- The date column
-- ---------------------------------------------------------------------------

alter table public.custom_field_values add column value_date date;

comment on column public.custom_field_values.value_date is
	'The value a `date` custom field holds. A calendar day, so no time zone — the fourth column the exactly-one-value check counts.';

-- The check is the statement of "exactly one typed column carries the value",
-- so it is re-stated in full rather than left counting three of four.
alter table public.custom_field_values drop constraint custom_field_values_exactly_one_value;
alter table public.custom_field_values
	add constraint custom_field_values_exactly_one_value
		check (num_nonnulls(value_text, value_numeric, value_boolean, value_date) = 1);

-- Same body as the generalized migration, one clause wider: which column a
-- type expects is this function's whole job, and a new type without a branch
-- here would store a null value and pass.
create or replace function public.check_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	definition record;
begin
	select value_type, allowed_values
	into definition
	from public.custom_field_definitions
	where id = new.field_definition_id;

	if not found then
		return new;
	end if;

	if (definition.value_type in ('text', 'select') and new.value_text is null)
		or (definition.value_type = 'numeric' and new.value_numeric is null)
		or (definition.value_type = 'boolean' and new.value_boolean is null)
		or (definition.value_type = 'date' and new.value_date is null)
	then
		raise exception 'custom field % expects a % value', new.field_definition_id, definition.value_type
			using errcode = 'check_violation';
	end if;

	if definition.value_type = 'select' and not definition.allowed_values ? new.value_text then
		raise exception 'value "%" is not an allowed value of custom field %', new.value_text, new.field_definition_id
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clearing a value is an edit, not a deletion
-- ---------------------------------------------------------------------------

-- Blank is not a value: two of the five types cannot represent an empty
-- string and the exactly-one-value check refuses a row with none, so emptying
-- a field removes its row. That makes the delete policy part of the edit
-- path, and owner/admin-only would mean a member could fill a field in and
-- then not be able to clear it.
--
-- `custom_field_definitions` : `custom_field_values` is `tags` : `taggings` —
-- a vocabulary the org owns, and a cell on a record any member may edit — so
-- this matches "Members can remove tags" rather than the canonical block. The
-- DEFINITIONS above stay owner/admin; the vocabulary is still configuration.
drop policy "Owners and admins can delete custom field values" on public.custom_field_values;

create policy "Members can clear custom field values"
	on public.custom_field_values for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

-- Re-issued in full rather than patched: a grant list is the readable
-- statement of what the browser may write, and half of one spread over two
-- migrations is not (the party-model migration's rule).
--
-- The entity columns stay insert-only, which is load-bearing for app code: it
-- is why setCustomFieldValue() looks a row up and then inserts or updates it
-- instead of upserting. PostgREST's upsert SETs every column of the payload on
-- the conflict path, so an upsert would need these updatable — and that would
-- let a browser re-point a stored value at another record.
revoke insert, update on table public.custom_field_values from authenticated;
grant insert (org_id, entity_type, entity_id, field_definition_id, value_text, value_numeric,
		value_boolean, value_date),
	update (value_text, value_numeric, value_boolean, value_date)
	on table public.custom_field_values to authenticated;

-- ---------------------------------------------------------------------------
-- The settings screen's page row
-- ---------------------------------------------------------------------------

-- A shell page like the rest of settings: it belongs to no feature (declaring
-- fields is org configuration, not a navigable capability owning a route) and
-- is exempt from the feature gate. See settingsNav in src/lib/navigation.ts.
insert into public.pages (id, feature_id, path, title) values
	('settings-custom-fields', null, '/settings/custom-fields', 'Custom fields')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Adding a custom field value type, in full
-- ---------------------------------------------------------------------------
--   1. `alter type public.custom_field_value_type add value '<name>'` in its
--      own migration — the value cannot be used in the transaction that adds it.
--   2. A `value_<name>` column here, counted by the exactly-one-value check
--      and granted on both insert and update.
--   3. A branch in `public.check_custom_field_value()` above.
--   4. `describeCustomField()` in src/lib/server/crm/records.ts — its switch is
--      exhaustive, so `npm run check` names the hole.
--   5. `customFieldColumns()` and `customFieldValueSchema()` in
--      src/lib/crm/custom-fields.ts, and an input branch in the record page's
--      edit modal.
--   6. `VALUE_TYPE_OPTIONS` in the settings screen's schema, so it can be picked.
