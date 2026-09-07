-- Custom fields for every record, not just a proposal option.
--
-- The proposals migration built the mechanism the whole template leans on: an
-- org declares a typed attribute once, and a value cannot exist without its
-- definition. That is the answer to "industry specifics are just custom
-- fields" — but it only worked for one kind of row, so a dental practice could
-- declare `warranty_years` on a proposal option and had nowhere to put
-- `insurance_carrier` on the patient.
--
-- This migration widens it along the axis everything else in this series uses:
-- a definition now declares WHICH kind of record it is for, and a value carries
-- the same (entity_type, entity_id) link as an address, an activity or a tag.
--
-- The pairing is a foreign key, not a trigger. Definitions gain a
-- `unique (id, entity_type)`, values reference it, and Postgres therefore
-- refuses to hang a contact's field off a product — the same composite trick
-- that pins a deal's stage to its own pipeline.

-- ---------------------------------------------------------------------------
-- Definitions declare what they are for
-- ---------------------------------------------------------------------------

-- Every existing definition was written for a proposal option, so that is the
-- default the backfill uses; the column stays NOT NULL afterwards because a
-- field for "some record, unspecified" has no meaning.
alter table public.custom_field_definitions
	add column entity_type public.crm_entity_type not null default 'proposal_option';

comment on column public.custom_field_definitions.entity_type is
	'Which kind of record this field is for. Values reference (id, entity_type), so a definition can never be filled in on the wrong kind.';

-- The key was unique per org; it is now unique per org per kind, so `notes`
-- can mean one thing on a contact and another on a product.
alter table public.custom_field_definitions drop constraint custom_field_definitions_org_id_key_key;
alter table public.custom_field_definitions
	add constraint custom_field_definitions_org_id_entity_type_key_key
		unique (org_id, entity_type, key),
	-- Composite target that makes the pairing below a foreign key.
	add constraint custom_field_definitions_id_entity_type_key unique (id, entity_type);

create index custom_field_definitions_org_id_entity_type_idx
	on public.custom_field_definitions (org_id, entity_type);

comment on table public.custom_field_definitions is
	'An org-defined, typed attribute for one kind of CRM record. The lookup table a custom value must reference.';

-- ---------------------------------------------------------------------------
-- proposal_custom_field_values → custom_field_values
-- ---------------------------------------------------------------------------

alter table public.proposal_custom_field_values rename to custom_field_values;
alter table public.custom_field_values rename column proposal_option_id to entity_id;

alter table public.custom_field_values
	rename constraint proposal_custom_field_values_pkey to custom_field_values_pkey;
alter table public.custom_field_values
	rename constraint proposal_custom_field_values_org_id_fkey to custom_field_values_org_id_fkey;
alter table public.custom_field_values
	rename constraint proposal_custom_field_values_exactly_one_value
	to custom_field_values_exactly_one_value;
alter index public.proposal_custom_field_values_org_id_idx
	rename to custom_field_values_org_id_idx;
alter index public.proposal_custom_field_values_field_definition_id_idx
	rename to custom_field_values_field_definition_id_idx;
alter table public.custom_field_values
	rename constraint proposal_custom_field_values_field_definition_id_org_id_fkey
	to custom_field_values_field_definition_id_org_id_fkey;
alter trigger proposal_custom_field_values_set_updated_at on public.custom_field_values
	rename to custom_field_values_set_updated_at;

-- The old shape pinned every value to a proposal option through a composite
-- foreign key. The link becomes polymorphic, so that key goes and the shared
-- existence trigger takes over — but the kind is NOT left to the trigger: the
-- (field_definition_id, entity_type) key below is what guarantees the value is
-- attached to the kind of record its definition was written for.
alter table public.custom_field_values
	drop constraint proposal_custom_field_values_proposal_option_id_org_id_fkey;

alter table public.custom_field_values
	add column entity_type public.crm_entity_type not null default 'proposal_option';

alter table public.custom_field_values
	drop constraint proposal_custom_field_values_proposal_option_id_field_defin_key,
	add constraint custom_field_values_entity_field_definition_key
		unique (entity_type, entity_id, field_definition_id),
	add constraint custom_field_values_field_definition_id_entity_type_fkey
		foreign key (field_definition_id, entity_type)
		references public.custom_field_definitions (id, entity_type) on delete cascade;

-- The default did its job for the existing rows; new rows must say which kind
-- they are for, and get it wrong loudly rather than quietly land on options.
alter table public.custom_field_values alter column entity_type drop default;
alter table public.custom_field_definitions alter column entity_type drop default;

create index custom_field_values_entity_idx
	on public.custom_field_values (org_id, entity_type, entity_id);

create trigger custom_field_values_check_entity
	before insert or update of org_id, entity_type, entity_id on public.custom_field_values
	for each row execute procedure public.check_crm_entity_link();

comment on table public.custom_field_values is
	'The value one CRM record holds for one custom field definition, in the column that matches the definition''s type.';

-- ---------------------------------------------------------------------------
-- The two value-checking functions follow the rename
-- ---------------------------------------------------------------------------

-- Same body as the proposals migration, pointed at the renamed table. Recreated
-- rather than left dangling: a function that silently stops finding values
-- would let a definition's type change out from under stored data, which is the
-- exact thing it exists to prevent.
create or replace function public.check_custom_field_definition_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.value_type <> old.value_type and exists (
		select 1 from public.custom_field_values where field_definition_id = new.id
	) then
		raise exception 'custom field % has values; its type cannot change', new.key
			using errcode = 'check_violation';
	end if;

	if new.value_type = 'select' and exists (
		select 1 from public.custom_field_values
		where field_definition_id = new.id and not new.allowed_values ? value_text
	) then
		raise exception 'custom field % has values outside its new allowed values', new.key
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

-- A definition is written for one kind of record; changing that under existing
-- values would strand every one of them on the wrong kind. The composite
-- foreign key blocks it too, but this raises the error that says why.
create or replace function public.check_custom_field_definition_entity_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.entity_type <> old.entity_type and exists (
		select 1 from public.custom_field_values where field_definition_id = new.id
	) then
		raise exception 'custom field % has values; the kind of record it applies to cannot change', new.key
			using errcode = 'check_violation';
	end if;
	return new;
end;
$$;

create trigger custom_field_definitions_check_entity_type
	before update of entity_type on public.custom_field_definitions
	for each row execute procedure public.check_custom_field_definition_entity_type();

-- The per-value check keeps its body and loses its proposal-only name.
drop trigger proposal_custom_field_values_check_value on public.custom_field_values;
drop function public.check_proposal_custom_field_value();

create function public.check_custom_field_value()
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

create trigger custom_field_values_check_value
	before insert or update on public.custom_field_values
	for each row execute procedure public.check_custom_field_value();

-- ---------------------------------------------------------------------------
-- Deleting a record takes its custom values with it
-- ---------------------------------------------------------------------------

-- The last extension of the one cleanup function. A value without its record is
-- the same orphan an address or a tagging would be — and the composite foreign
-- key only covers the definition side, never the entity side, because the
-- entity side is exactly the key Postgres cannot express.
create or replace function public.on_crm_entity_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	-- Not named `kind`: `addresses` has a column by that name, and plpgsql
	-- resolves the variable first, which would silently match every row.
	deleted_kind public.crm_entity_type := tg_argv[0]::public.crm_entity_type;
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.addresses
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.activities
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.taggings
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.custom_field_values
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	return old;
end;
$$;

-- proposal_options can carry custom values and had no trigger of their own,
-- because until now their values went with them through the composite key that
-- this migration removed.
create trigger proposal_options_crm_entity_deleted
	after delete on public.proposal_options
	for each row execute procedure public.on_crm_entity_deleted('proposal_option');

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

-- entity_type joins key and value_type as insert-only: what a definition is
-- for is decided when it is created, and the trigger above says why.
revoke insert, update on table public.custom_field_definitions from authenticated;
grant insert (org_id, entity_type, key, label, value_type, allowed_values),
	update (key, label, allowed_values)
	on table public.custom_field_definitions to authenticated;

revoke insert, update on table public.custom_field_values from authenticated;
grant insert (org_id, entity_type, entity_id, field_definition_id, value_text, value_numeric,
		value_boolean),
	update (value_text, value_numeric, value_boolean)
	on table public.custom_field_values to authenticated;
