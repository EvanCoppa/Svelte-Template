import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { listTickets as loadTickets } from '$lib/server/crm/tickets';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const listTicketsAccess: ToolAccess = { feature: 'tickets', level: 'read' };

const ticketStatusSchema = z.enum(Constants.public.Enums.ticket_status);
const ticketPrioritySchema = z.enum(Constants.public.Enums.ticket_priority);

const ticketSummarySchema = z.object({
	id: z.string(),
	subject: z.string(),
	status: ticketStatusSchema,
	priority: ticketPrioritySchema,
	clientName: z.string().nullable(),
	createdAt: z.string()
});

export const listTickets = tool({
	description:
		'List support tickets, newest first, with the client each concerns. ' +
		'Narrow by status, or to one client with its id from searchClients.',
	inputSchema: z.object({
		status: ticketStatusSchema.optional().describe('Only tickets in this status.'),
		clientId: z.guid().optional().describe('Only tickets for this client.')
	}),
	outputSchema: z.object({ tickets: z.array(ticketSummarySchema) }),
	contextSchema: toolContextSchema,
	execute: async ({ status, clientId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listTicketsAccess);
		const tickets = await loadTickets(supabase, orgId, { status, clientId });
		return {
			tickets: tickets.map((ticket) => ({
				id: ticket.id,
				subject: ticket.subject,
				status: ticket.status,
				priority: ticket.priority,
				clientName: ticket.clients?.name ?? null,
				createdAt: ticket.created_at
			}))
		};
	}
});
