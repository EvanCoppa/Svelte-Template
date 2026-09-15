import { tool } from 'ai';
import { z } from 'zod';
import { RECORD_TYPES, type RecordType } from '$lib/schemas/records';
import { getRecord as loadRecord } from '$lib/server/crm/records';
import { loadVocabulary } from '$lib/server/features';
import { insertRecord } from '$lib/server/records';
import { toolContextSchema } from '../context';
import { anyRecordAccess, canOpenFor, recordAccess, requireToolContext } from './access';
import { describeRecordFields, recordFieldSchema } from './record-fields';
import { recordRefSchema } from './record-ref';

export const createRecordAccess = anyRecordAccess('manage');

/**
 * The kinds this writes — every kind the generic form creates but a task.
 * A task is the one record whose creation is not just a row: who is on it is
 * a relationship, so the tasks page keeps its own modal and the assistant
 * keeps `createTask`, which writes the row and the people in one call
 * (docs/tasks.md). A proposal and a shipment are absent for the same kind of
 * reason and are already outside this registry.
 */
export const CREATABLE_KINDS = RECORD_TYPES.filter(
	(type): type is Exclude<RecordType, 'task'> => type !== 'task'
);

export const createRecord = tool({
	description:
		'Create a record of any kind — the same fields and validation as the workspace’s own ' +
		'"Add" form. Read listRecordFields for the kind first: it says which fields are ' +
		'required, what each one takes, and the values a picked field accepts. Pass every ' +
		'value as a string: an amount as "1200", a date as "2026-09-30", an instant as ISO ' +
		'8601 with offset, a select as one of its option values, and a field naming another ' +
		'record as that record’s id (from findRecords). Leave a field out rather than ' +
		'guessing at it. To create a task, use createTask, which also puts people on it.',
	inputSchema: z.object({
		kind: z
			.enum(CREATABLE_KINDS)
			.describe('The kind of record; a task is created with createTask instead.'),
		values: z
			.record(z.string(), z.string())
			.describe('Field name → value, using the names from listRecordFields.')
	}),
	outputSchema: z.object({
		created: z.boolean(),
		/** Why it was not created — one sentence per field the schema refused. */
		issues: z.array(z.string()),
		record: recordRefSchema.optional(),
		/** What the kind accepts, returned only when the call did not validate, so one retry can fix it. */
		fields: z.array(recordFieldSchema).optional()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, values }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(kind, 'manage'));

		const result = await insertRecord(supabase, orgId, kind, values);
		if (!result.created) {
			return {
				created: false,
				issues: result.issues,
				fields: await describeRecordFields(supabase, orgId, kind)
			};
		}

		// Named the way its page names it, so the answer can say what was made
		// rather than repeating back what was asked for. A read that comes back
		// empty answers without a name rather than inventing one — the same
		// thing `updateRecord` does.
		const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
		const record = await loadRecord(supabase, orgId, kind, result.id, canOpenFor(org), vocabulary);
		if (!record) return { created: true, issues: [] };
		return { created: true, issues: [], record: { kind, id: result.id, name: record.name } };
	}
});
