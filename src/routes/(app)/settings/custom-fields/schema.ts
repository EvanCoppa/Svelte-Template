import { z } from 'zod';
import { RECORD_KINDS } from '$lib/crm/records';

/**
 * The custom fields settings page's three forms — the vocabulary of extra
 * attributes an org declares for a kind of record.
 *
 * Every constraint here mirrors one the database already enforces, so a
 * mistake is an inline error rather than a 500 carrying a Postgres message:
 * the snake_case key check, the choices-iff-select rule, and the kinds the
 * `crm_entity_type` enum admits.
 */

/** Mirrors `custom_field_definitions_key_is_snake_case`. */
const key = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Give the field a key.')
	.max(60, 'Keep the key under 60 characters.')
	.regex(
		/^[a-z][a-z0-9_]*$/,
		'Use lower-case letters, numbers and underscores, starting with a letter.'
	);

const label = z
	.string()
	.trim()
	.min(1, 'Give the field a label.')
	.max(120, 'Keep the label under 120 characters.');

/** Mirrors `public.custom_field_value_type`. */
const valueType = z.enum(['text', 'numeric', 'boolean', 'select', 'date']);

/** The kinds a value can be filled in on — the record page's kinds. */
const entityType = z.enum(RECORD_KINDS);

/** Comma-separated, the way a billable's `unit_choices` is typed. */
const choices = z.string().trim().max(1000, 'Keep the choices under 1000 characters.').default('');

export const createCustomFieldSchema = z
	.object({ entity_type: entityType, key, label, value_type: valueType, allowed_values: choices })
	.refine((data) => data.value_type !== 'select' || choiceList(data.allowed_values).length > 0, {
		error: 'A choice list needs at least one choice.',
		path: ['allowed_values']
	});

/**
 * Editing leaves out `value_type` and `entity_type` on purpose: both are
 * insert-only by column grant, and the definition triggers refuse to change
 * either while values exist. The form does not offer what the database will
 * not take — so the choices-iff-select rule is checked in the action, where
 * the stored type is known.
 *
 * Ids are `z.guid()` for the reason the staff schema gives: seeded fixture ids.
 */
export const updateCustomFieldSchema = z.object({
	id: z.guid(),
	key,
	label,
	allowed_values: choices
});

export const deleteCustomFieldSchema = z.object({ id: z.guid() });

/** The choices as typed: split, trimmed, blank-free and deduped, in order. */
export function choiceList(value: string): string[] {
	return [
		...new Set(
			value
				.split(',')
				.map((choice) => choice.trim())
				.filter(Boolean)
		)
	];
}

/** Drawn by the kind it declares, like PARTY_STATUS_OPTIONS in $lib/schemas/records. */
export const VALUE_TYPE_OPTIONS = [
	{ value: 'text', label: 'Text' },
	{ value: 'numeric', label: 'Number' },
	{ value: 'date', label: 'Date' },
	{ value: 'boolean', label: 'Yes / no' },
	{ value: 'select', label: 'Choice list' }
] as const;
