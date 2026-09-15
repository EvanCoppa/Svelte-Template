import { tool } from 'ai';
import { z } from 'zod';
import { RECORD_TYPES } from '$lib/schemas/records';
import { toolContextSchema } from '../context';
import { anyRecordAccess, recordAccess, requireToolContext } from './access';
import { describeRecordFields, recordFieldSchema } from './record-fields';

/** Reading a form is a writer's question: offered to whoever may write a record of some kind. */
export const listRecordFieldsAccess = anyRecordAccess('manage');

export const listRecordFields = tool({
	description:
		'What a kind of record can be written with: every field’s name, what it holds, whether ' +
		'it is required, and — for a field chosen from a fixed or workspace-owned set (a status, ' +
		'a deal’s stage, an assignee) — the values it accepts. Read this before createRecord. ' +
		'For an existing record, getRecord already returns the same list as editableFields.',
	inputSchema: z.object({
		kind: z
			.enum(RECORD_TYPES)
			.describe(
				'The kind of record whose form to describe — including a task, which createTask writes.'
			)
	}),
	outputSchema: z.object({
		kind: z.string(),
		fields: z.array(recordFieldSchema)
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, recordAccess(kind, 'manage'));
		return { kind, fields: await describeRecordFields(supabase, orgId, kind) };
	}
});
