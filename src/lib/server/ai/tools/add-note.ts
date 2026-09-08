import { tool } from 'ai';
import { z } from 'zod';
import { createActivity } from '$lib/server/crm/activities';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const addNoteAccess: ToolAccess = { feature: 'companies', level: 'manage' };

export const addNote = tool({
	description:
		'Add a note to a company record, logged as an activity by the current user. ' +
		'Use the wording the user gave; do not embellish it.',
	inputSchema: z.object({
		companyId: z.guid().describe('The company id, from searchCompanies.'),
		body: z.string().trim().min(1).max(4000).describe('The note text.')
	}),
	outputSchema: z.object({
		noteId: z.string(),
		companyId: z.string(),
		createdAt: z.string()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ companyId, body }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, addNoteAccess);
		const note = await createActivity(
			supabase,
			orgId,
			{ type: 'note', body },
			{ entityType: 'company', entityId: companyId }
		);
		return { noteId: note.id, companyId, createdAt: note.created_at };
	}
});
