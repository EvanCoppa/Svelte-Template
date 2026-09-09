import type { SupabaseClient } from '@supabase/supabase-js';
import { allowedValues, type CustomFieldValueType } from '$lib/crm/custom-fields';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `custom_field_definitions` and `custom_field_values` — the
 * typed attributes an org declares for one kind of record, and what each
 * record holds for them. A definition names its `entity_type`, and a value
 * references `(definition, entity_type)`, so a contact's field can never be
 * filled in on a product (see the generalized custom fields migration).
 *
 * Declaring a field is org configuration — /settings/custom-fields, gated on
 * owner/admin because that is what the definitions' RLS accepts. Filling one
 * in is editing the record, so the generic record page's action takes
 * `manage` on the feature that owns the record's kind.
 *
 * Write params are Picked down to the columns the migration's grants let the
 * browser role write, the companies.ts contract, so a forbidden column is a
 * type error here rather than a 42501 at runtime.
 */

export type CustomFieldDefinition = Tables<'custom_field_definitions'>;
export type CustomFieldValue = Tables<'custom_field_values'>;

/** One of the kind's fields, with the value this record holds for it — or none yet. */
export type CustomField = { definition: CustomFieldDefinition; value: CustomFieldValue | null };

/**
 * Every field the org declares for the record's kind, by label, paired with
 * the record's value where it has one. Two plain queries joined here rather
 * than one embed: the values table carries two foreign keys to definitions,
 * and naming one in an embed hint is the kind of detail a reader should not
 * have to know to trust the join.
 */
export async function listCustomFields(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef
): Promise<CustomField[]> {
	const [definitions, values] = await Promise.all([
		supabase
			.from('custom_field_definitions')
			.select('*')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.order('label'),
		supabase
			.from('custom_field_values')
			.select('*')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
	]);
	const byDefinition = new Map(unwrap(values).map((value) => [value.field_definition_id, value]));
	return unwrap(definitions).map((definition) => ({
		definition,
		value: byDefinition.get(definition.id) ?? null
	}));
}

// --- Definitions -------------------------------------------------------------

/** Mirrors the insert grant: what a definition is FOR is decided when it is created. */
type DefinitionInsertColumn = 'entity_type' | 'key' | 'label' | 'value_type' | 'allowed_values';

/**
 * Mirrors the update grant, which is narrower: `value_type` and `entity_type`
 * are insert-only, and the two definition triggers refuse to change either
 * while values exist. The form does not offer what the database will not take.
 */
type DefinitionUpdateColumn = 'key' | 'label' | 'allowed_values';

/**
 * Every field the org declares, for every kind — the settings screen groups
 * them itself, so this is one query rather than one per kind.
 */
export async function listCustomFieldDefinitions(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<CustomFieldDefinition[]> {
	return unwrap(
		await supabase
			.from('custom_field_definitions')
			.select('*')
			.eq('org_id', orgId)
			.order('entity_type')
			.order('label')
	);
}

export async function createCustomFieldDefinition(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'custom_field_definitions'>, DefinitionInsertColumn>
): Promise<CustomFieldDefinition> {
	return unwrap(
		await supabase
			.from('custom_field_definitions')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateCustomFieldDefinition(
	supabase: SupabaseClient<Database>,
	orgId: string,
	definitionId: string,
	values: Pick<TablesUpdate<'custom_field_definitions'>, DefinitionUpdateColumn>
): Promise<CustomFieldDefinition> {
	return unwrap(
		await supabase
			.from('custom_field_definitions')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', definitionId)
			.select()
			.single()
	);
}

export async function deleteCustomFieldDefinition(
	supabase: SupabaseClient<Database>,
	orgId: string,
	definitionId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('custom_field_definitions')
			.delete()
			.eq('org_id', orgId)
			.eq('id', definitionId)
			.select('id'),
		'Custom field'
	);
}

// --- Values ------------------------------------------------------------------

/** The four typed columns. Exactly one is non-null — the check constraint counts them. */
export type CustomFieldColumns = Pick<
	TablesInsert<'custom_field_values'>,
	'value_text' | 'value_numeric' | 'value_boolean' | 'value_date'
>;

const NO_VALUE: CustomFieldColumns = {
	value_text: null,
	value_numeric: null,
	value_boolean: null,
	value_date: null
};

/**
 * The one place a posted string becomes columns — the write mirror of
 * `describeCustomField()`, and the same switch `$lib/server/records.ts` uses
 * to turn a created record's strings into its columns.
 *
 * All four columns are always named so an update clears the other three: a
 * definition whose type legitimately changed (only possible once every value
 * was cleared) never leaves a stale column behind.
 */
export function customFieldColumns(
	valueType: CustomFieldValueType,
	value: string
): CustomFieldColumns {
	switch (valueType) {
		case 'text':
		case 'select':
			return { ...NO_VALUE, value_text: value };
		case 'numeric':
			return { ...NO_VALUE, value_numeric: Number(value) };
		case 'boolean':
			return { ...NO_VALUE, value_boolean: value === 'true' };
		case 'date':
			return { ...NO_VALUE, value_date: value };
	}
}

/**
 * What one record holds for one definition: a look-up, then an insert or an
 * update by id — deliberately NOT an upsert.
 *
 * PostgREST's upsert SETs every column of the payload on the conflict path,
 * and `org_id`/`entity_type`/`entity_id`/`field_definition_id` are insert-only
 * by column grant (an address's rule: moving a row between records is a delete
 * and a create). An upsert would need them updatable, which would let a
 * browser re-point a stored value at another record.
 */
export async function setCustomFieldValue(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	definitionId: string,
	columns: CustomFieldColumns
): Promise<void> {
	const existing = unwrap(
		await supabase
			.from('custom_field_values')
			.select('id')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.eq('field_definition_id', definitionId)
			.maybeSingle()
	);

	if (existing) {
		ensure(
			await supabase
				.from('custom_field_values')
				.update(columns)
				.eq('org_id', orgId)
				.eq('id', existing.id)
		);
		return;
	}

	ensure(
		await supabase.from('custom_field_values').insert({
			...columns,
			org_id: orgId,
			entity_type: entity.entityType,
			entity_id: entity.entityId,
			field_definition_id: definitionId
		})
	);
}

/**
 * Emptying a field. Blank is not a value: the row goes rather than holding an
 * empty string, which three of the five types cannot represent and the
 * exactly-one-value check would refuse outright. Clearing a field that was
 * never filled in is a no-op, so this uses `ensure()` — not `unwrapDeleted()`,
 * which exists to catch a delete RLS silently dropped.
 */
export async function clearCustomFieldValue(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	definitionId: string
): Promise<void> {
	ensure(
		await supabase
			.from('custom_field_values')
			.delete()
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.eq('field_definition_id', definitionId)
	);
}

/** One field as the edit form asks for it: how to draw it, and the string it holds. */
export type CustomFieldEntry = {
	id: string;
	key: string;
	label: string;
	valueType: CustomFieldValueType;
	/** A select's choices; null for every other type. */
	choices: string[] | null;
	/** The stored value as a string — '' when the record has not filled it in. */
	value: string;
};

/**
 * The write shape of what `listCustomFields()` read. Every value becomes a
 * string, because that is what the form posts and what
 * `customFieldValueSchema()` checks; `describeCustomField()` stays the read
 * shape, and the two never merge — one is for showing, one is for editing.
 */
export function customFieldEntries(fields: CustomField[]): CustomFieldEntry[] {
	return fields.map(({ definition, value }) => ({
		id: definition.id,
		key: definition.key,
		label: definition.label,
		valueType: definition.value_type,
		choices: allowedValues(definition.allowed_values),
		value: storedValue(definition.value_type, value)
	}));
}

function storedValue(valueType: CustomFieldValueType, value: CustomFieldValue | null): string {
	if (!value) return '';
	switch (valueType) {
		case 'text':
		case 'select':
			return value.value_text ?? '';
		case 'numeric':
			return value.value_numeric === null ? '' : String(value.value_numeric);
		case 'boolean':
			return value.value_boolean === null ? '' : String(value.value_boolean);
		case 'date':
			return value.value_date ?? '';
	}
}
