import { z } from 'zod';
import type { Enums, Json } from '$lib/database.types';

/**
 * What a custom field is, client-side: how it is drawn, and what a posted
 * string must look like for it.
 *
 * A definition declares a `value_type`, and that type is the only thing that
 * decides how the field renders and what it accepts — the rule a record's
 * fields already follow ("never by a runtime check"). The server mirror is
 * `customFieldColumns()` in `$lib/server/crm/custom-fields`, which turns the
 * string this module validates into the one typed column its type names.
 *
 * Client-safe like every `$lib/crm/*` module — no `$lib/server` imports — so
 * the edit modal validates with the same rules the action enforces.
 */

export type CustomFieldValueType = Enums<'custom_field_value_type'>;

/** How a field is DRAWN. One per value type, so the modal has no runtime sniffing. */
export type CustomFieldInputKind = 'text' | 'number' | 'date' | 'boolean' | 'select';

export function customFieldInputKind(valueType: CustomFieldValueType): CustomFieldInputKind {
	switch (valueType) {
		case 'text':
			return 'text';
		case 'numeric':
			return 'number';
		case 'date':
			return 'date';
		case 'boolean':
			return 'boolean';
		case 'select':
			return 'select';
	}
}

/**
 * The choices a `select` declares, or null for every other type.
 *
 * `allowed_values` is `jsonb`, so it arrives as `Json` and is narrowed here
 * rather than cast: the column check constrains it to a non-empty array of
 * strings, but the type system cannot know that, and a cast would be exactly
 * the silencing CLAUDE.md forbids.
 */
export function allowedValues(value: Json | null): string[] | null {
	if (!Array.isArray(value)) return null;
	return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null;
}

/**
 * What a posted string must look like for one definition — strings in,
 * strings out, the contract the generic record form already runs on.
 *
 * Blank never reaches here: an empty value clears the field, and clearing is
 * a delete rather than a stored empty string (the exactly-one-value check
 * refuses a row with no value at all).
 */
export function customFieldValueSchema(definition: {
	value_type: CustomFieldValueType;
	allowed_values: Json | null;
}): z.ZodType<string> {
	switch (definition.value_type) {
		case 'text':
			return z.string().trim().max(2000, 'Must be 2000 characters or fewer.');
		case 'numeric':
			// Capped at 15 integer digits: `numeric` arrives as a JSON number, so
			// anything past double precision would not round-trip.
			return z
				.string()
				.trim()
				.regex(/^-?\d{1,15}(\.\d{1,6})?$/, 'Enter a number.');
		case 'date':
			// What `<input type="date">` posts, the same shape as `optionalDate`
			// in $lib/schemas/records — minus the blank alternative.
			return z
				.string()
				.trim()
				.regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');
		case 'boolean':
			// The `is_featured` idiom: a boolean posts as a string like every
			// other field, and the server turns it into a column.
			return z.enum(['true', 'false'], { error: 'Choose yes or no.' });
		case 'select': {
			// Not `z.enum`: its choices come from a row, and zod needs a non-empty
			// tuple known at build time.
			const choices = allowedValues(definition.allowed_values) ?? [];
			return z
				.string()
				.trim()
				.refine((value) => choices.includes(value), { error: 'Pick one of the choices.' });
		}
	}
}
