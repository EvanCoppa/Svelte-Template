import { tool } from 'ai';
import { z } from 'zod';
import { createNote } from '$lib/server/crm/notes';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const addNoteAccess: ToolAccess = { feature: 'clients', level: 'manage' };

export const addNote = tool({
	description:
		'Add a note to a client record, authored by the current user. ' +
		'Use the wording the user gave; do not embellish it.',
	inputSchema: z.object({
		clientId: z.guid().describe('The client id, from searchClients.'),
		body: z.string().trim().min(1).max(4000).describe('The note text.')
	}),
	outputSchema: z.object({
		noteId: z.string(),
		clientId: z.string(),
		createdAt: z.string()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ clientId, body }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, addNoteAccess);
		const note = await createNote(supabase, orgId, { body, client_id: clientId });
		return { noteId: note.id, clientId, createdAt: note.created_at };
	}
});
