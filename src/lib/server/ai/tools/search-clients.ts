import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { listClients, type Client } from '$lib/server/crm/clients';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const searchClientsAccess: ToolAccess = { feature: 'clients', level: 'read' };

export const clientStatusSchema = z.enum(Constants.public.Enums.client_status);

/** What the model gets back about a client — enough to name it and act on it, never the whole row. */
export const clientSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	company: z.string().nullable(),
	email: z.string().nullable(),
	status: clientStatusSchema
});

export function summarizeClient(client: Client): z.infer<typeof clientSummarySchema> {
	return {
		id: client.id,
		name: client.name,
		company: client.company,
		email: client.email,
		status: client.status
	};
}

const MAX_RESULTS = 20;

export const searchClients = tool({
	description:
		'Find clients by name, company or email, optionally narrowed to a status. ' +
		'Call this before any tool that needs a client id. Returns at most 20 matches.',
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.max(200)
			.optional()
			.describe('Text to match against the client name, company or email. Omit to list everyone.'),
		status: clientStatusSchema.optional().describe('Only clients in this status.')
	}),
	outputSchema: z.object({
		clients: z.array(clientSummarySchema),
		total: z.number().int().describe('How many clients matched, before the 20-result cap.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ query, status }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, searchClientsAccess);
		const needle = query?.toLowerCase();
		const matches = (await listClients(supabase, orgId)).filter(
			(client) =>
				(!status || client.status === status) &&
				(!needle ||
					[client.name, client.company, client.email].some((value) =>
						value?.toLowerCase().includes(needle)
					))
		);
		return { clients: matches.slice(0, MAX_RESULTS).map(summarizeClient), total: matches.length };
	}
});
