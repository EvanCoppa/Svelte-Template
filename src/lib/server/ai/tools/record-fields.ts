import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '$lib/database.types';
import {
	RECORD_FORMS,
	RECORD_SCHEMAS,
	type RecordFieldOption,
	type RecordType
} from '$lib/schemas/records';
import { pickerOptions } from '$lib/server/records';

/**
 * What one kind of record can be written with — the generic record form's
 * fields, as the model reads them. Beside the tools rather than inside one
 * because three of them need it and none owns it: `getRecord` hands a writer
 * the fields it may change, `listRecordFields` answers "what does a <kind>
 * take" before there is a record to read, and `createRecord` hands them back
 * when a call did not validate.
 */

export const recordFieldSchema = z.object({
	name: z.string(),
	label: z.string(),
	type: z
		.string()
		.describe(
			'text, email, tel, number, integer, date, datetime, textarea; select, stage, outcome ' +
				'or member — one of the values in options; company, contact or property — that ' +
				'record’s id, from findRecords; subject — a "<kind>:<id>" pair; geo — a captured ' +
				'point, which only a device can fill in.'
		),
	required: z
		.boolean()
		.describe('Whether the record cannot be written without it. Everything else may be left out.'),
	options: z
		.array(z.object({ value: z.string(), label: z.string() }))
		.optional()
		.describe('The values this field accepts, when they are a fixed or workspace-owned set.')
});

export type RecordFieldDescription = z.infer<typeof recordFieldSchema>;

/**
 * The pickers that carry their options: a stage on a board, a visit outcome,
 * someone who works here. None of them is a RECORD, so `findRecords` cannot
 * reach them and the model would have nothing to name them by.
 *
 * A picker that points at a record carries none on purpose — its id comes
 * from `findRecords`, and pasting every company in the workspace into a field
 * description is the list tool's job done badly.
 */
const LISTED_PICKERS = ['stage', 'outcome', 'member'] as const;

/**
 * Which fields the kind's own schema insists on, asked by validating an empty
 * record: whatever it complains about is what a writer must supply. Derived
 * rather than listed, so a schema that gains a required field says so here
 * with no second edit.
 */
function requiredFields(type: RecordType): Set<string> {
	const empty = RECORD_SCHEMAS[type].safeParse({});
	if (empty.success) return new Set();
	return new Set(empty.error.issues.map((issue) => String(issue.path[0])));
}

/** One option as the model reads it: a picker's sublabel is what tells two same-named rows apart. */
function option({ value, label, sublabel }: RecordFieldOption) {
	return { value, label: sublabel ? `${label} (${sublabel})` : label };
}

/**
 * The fields `createRecord` and `updateRecord` accept for a kind, from the
 * same registry the form renders — a select carries its options, a deal's
 * stage the org's own stages (each labelled with its board), an assignee the
 * roster, and a party picker says which kind of id it takes.
 */
export async function describeRecordFields(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType
): Promise<RecordFieldDescription[]> {
	const fields = RECORD_FORMS[type].fields;
	const wanted = LISTED_PICKERS.filter((kind) => fields.some((field) => field.type === kind));
	const loaded = await Promise.all(wanted.map((kind) => pickerOptions(supabase, orgId, kind)));
	const rows = new Map<string, RecordFieldOption[]>(
		wanted.map((kind, index) => [kind, loaded[index]])
	);
	const required = requiredFields(type);

	return fields.map((field) => {
		const described: RecordFieldDescription = {
			name: field.name,
			label: field.label,
			type: field.type,
			required: required.has(field.name)
		};
		if (field.type === 'select') {
			return { ...described, options: (field.options ?? []).map(option) };
		}
		const picked = rows.get(field.type);
		return picked ? { ...described, options: picked.map(option) } : described;
	});
}
