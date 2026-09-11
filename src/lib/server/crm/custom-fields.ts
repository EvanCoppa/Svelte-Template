import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * Data access for `custom_field_definitions` and `custom_field_values` — the
 * typed attributes an org declares for one kind of record, and what each
 * record holds for them. A definition names its `entity_type`, and a value
 * references `(definition, entity_type)`, so a contact's field can never be
 * filled in on a product (see the generalized custom fields migration).
 *
 * Reads only, for now; declaring fields is a settings screen and filling
 * them in belongs to a record's edit form, both following companies.ts.
 */

export type CustomFieldDefinition = Tables<'custom_field_definitions'>;
export type CustomFieldValue = Tables<'custom_field_values'>;

/** One of the kind's fields, with the value this record holds for it — or none yet. */
export type CustomField = { definition: CustomFieldDefinition; value: CustomFieldValue | null };

/**
 * Every field the org declares for the record's kind, in the order the org
 * put them in, paired with the record's value where it has one. A field with
 * no `sort_order` sorts by label behind those that have one — the
 * null-inherits rule, and what a shipped set (the industry_custom_fields
 * migration) needs so eleven insurance fields read as a form instead of
 * interleaving alphabetically with the permit and the dumpster.
 *
 * Two plain queries joined here rather than one embed: the values table
 * carries two foreign keys to definitions, and naming one in an embed hint is
 * the kind of detail a reader should not have to know to trust the join.
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
			.order('sort_order', { nullsFirst: false })
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
