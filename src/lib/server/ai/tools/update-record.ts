import { tool } from 'ai';
import { z } from 'zod';
import { getRecord as loadRecord } from '$lib/server/crm/records';
import { loadVocabulary } from '$lib/server/features';
import { patchRecord, type EditableRecordType } from '$lib/server/records';
import { RECORD_TYPES } from '$lib/schemas/records';
import { toolContextSchema } from '../context';
import { anyRecordAccess, canOpenFor, recordAccess, requireToolContext } from './access';
import { recordRefSchema } from './record-ref';

export const updateRecordAccess = anyRecordAccess('manage');

/**
 * The kinds the generic form edits — every creatable kind but an invoice,
 * which is a document with a lifecycle its own page owns (`isEditableRecordType`).
 */
const EDITABLE_KINDS = RECORD_TYPES.filter(
	(type): type is EditableRecordType => type !== 'invoice'
);

export const updateRecord = tool({
	description:
		'Change fields on one record — the same fields and validation as the record’s edit ' +
		'form. Name only the fields to change; the rest keep their values. Read the record ' +
		'first (getRecord lists editableFields with their names, types and options) and pass ' +
		'every value as a string: an amount as "1200", a date as "2026-09-30", an instant as ' +
		'ISO 8601 with offset, a select as one of its option values, a record picker as that ' +
		'record’s id. An empty string clears a field.',
	inputSchema: z.object({
		kind: z.enum(EDITABLE_KINDS).describe('The kind of record; an invoice is not edited here.'),
		id: z.guid().describe('The record id, from findRecords or getRecord.'),
		changes: z
			.record(z.string(), z.string())
			.describe('Field name → new value, using the names from getRecord’s editableFields.')
	}),
	outputSchema: z.object({
		saved: z.boolean(),
		/** Why it was not saved — one sentence per field the schema refused. */
		issues: z.array(z.string()),
		record: recordRefSchema.optional()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, id, changes }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(kind, 'manage'));
		if (Object.keys(changes).length === 0) {
			throw new Error('Name at least one field to change.');
		}

		const result = await patchRecord(supabase, orgId, kind, id, changes);
		if (!result.saved) return { saved: false, issues: result.issues };

		const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
		const record = await loadRecord(supabase, orgId, kind, id, canOpenFor(org), vocabulary);
		if (!record) return { saved: true, issues: [] };
		return { saved: true, issues: [], record: { kind, id, name: record.name } };
	}
});
