import { tool } from 'ai';
import { z } from 'zod';
import { getClient as loadClient } from '$lib/server/crm/clients';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { clientSummarySchema, summarizeClient } from './search-clients';

export const getClientAccess: ToolAccess = { feature: 'clients', level: 'read' };

const contactSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	title: z.string().nullable(),
	isPrimary: z.boolean()
});

export const getClient = tool({
	description:
		'Everything about one client: the record plus its contacts. ' +
		'Needs the client id from searchClients.',
	inputSchema: z.object({
		clientId: z.guid().describe('The client id, from searchClients.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		client: clientSummarySchema
			.extend({ phone: z.string().nullable(), website: z.string().nullable() })
			.optional(),
		contacts: z.array(contactSummarySchema)
	}),
	contextSchema: toolContextSchema,
	execute: async ({ clientId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, getClientAccess);
		const client = await loadClient(supabase, orgId, clientId);
		if (!client) return { found: false, contacts: [] };
		return {
			found: true,
			client: { ...summarizeClient(client), phone: client.phone, website: client.website },
			contacts: client.client_contacts.map((contact) => ({
				id: contact.id,
				name: contact.name,
				email: contact.email,
				phone: contact.phone,
				title: contact.title,
				isPrimary: contact.is_primary
			}))
		};
	}
});
