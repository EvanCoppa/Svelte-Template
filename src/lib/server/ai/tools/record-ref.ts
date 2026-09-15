import { z } from 'zod';
import { RECORD_KINDS } from '$lib/crm/records';
import type { FieldValue } from '$lib/server/crm/records';

/**
 * What the kind-addressed tools share: the `kind` a call names (one of the
 * record kinds with a page — `$lib/crm/records`), a record reference the
 * model can follow from one tool to the next, and a reading of a record
 * field as one string. Kept beside the tools rather than in one of them
 * because four of them need it and none owns it.
 */

export const recordKindSchema = z
	.enum(RECORD_KINDS)
	.describe('The kind of record. The session context lists which kinds this workspace has.');

/** A record by kind, id and name — enough to open it, name it, and pass it to another tool. */
export const recordRefSchema = z.object({
	kind: recordKindSchema,
	id: z.string(),
	name: z.string()
});

/**
 * A record field's value as text, for a reader that reads rather than
 * draws: money with its currency, a yes or a no, a person by name, an
 * instant as the ISO string the instructions tell the model to write out
 * in the user's zone. Empty is null, never a dash.
 */
export function fieldValueText(
	value: FieldValue,
	people: ReadonlyMap<string, string>
): string | null {
	switch (value.type) {
		case 'empty':
			return null;
		case 'text':
		case 'link':
		case 'record':
		case 'date':
		case 'datetime':
			return value.value;
		case 'number':
			return String(value.value);
		case 'money':
			return `${value.value} ${value.currency}${value.unit ? ` per ${value.unit}` : ''}`;
		case 'boolean':
			return value.value ? 'yes' : 'no';
		case 'person':
			return people.get(value.userId) ?? 'a member';
	}
}
