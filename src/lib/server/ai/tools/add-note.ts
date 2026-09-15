import { tool } from 'ai';
import { z } from 'zod';
import { createActivity } from '$lib/server/crm/activities';
import { toolContextSchema } from '../context';
import { anyRecordAccess, recordAccess, requireToolContext } from './access';
import { recordKindSchema } from './record-ref';

/**
 * An activity hangs off ANY record through the shared entity link, so this is
 * addressed by kind like the rest of that family — one door, checking the kind
 * each call names, rather than a note tool per table.
 */
export const addNoteAccess = anyRecordAccess('manage');

export const addNote = tool({
	description:
		'Add a note to any record — a company, a contact, a deal, a task — logged as an ' +
		'activity by the current user and shown on the record’s timeline. Use the wording the ' +
		'user gave; do not embellish it.',
	inputSchema: z.object({
		kind: recordKindSchema,
		id: z.guid().describe('The record id, from findRecords or another tool’s result.'),
		body: z.string().trim().min(1).max(4000).describe('The note text.')
	}),
	outputSchema: z.object({
		noteId: z.string(),
		kind: z.string(),
		recordId: z.string(),
		createdAt: z.string()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, id, body }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, recordAccess(kind, 'manage'));
		const note = await createActivity(
			supabase,
			orgId,
			{ type: 'note', body },
			{ entityType: kind, entityId: id }
		);
		return { noteId: note.id, kind, recordId: id, createdAt: note.created_at };
	}
});
