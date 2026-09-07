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
	companyName: z.string().nullable(),
	contactName: z.string().nullable(),
	createdAt: z.string()
});

export const listTickets = tool({
	description:
		'List support tickets, newest first, with the company and contact each concerns. ' +
		'Narrow by status, or to one company or contact by id.',
	inputSchema: z.object({
		status: ticketStatusSchema.optional().describe('Only tickets in this status.'),
		companyId: z.guid().optional().describe('Only tickets for this company.'),
		contactId: z.guid().optional().describe('Only tickets for this contact.')
	}),
	outputSchema: z.object({ tickets: z.array(ticketSummarySchema) }),
	contextSchema: toolContextSchema,
	execute: async ({ status, companyId, contactId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listTicketsAccess);
		const tickets = await loadTickets(supabase, orgId, { status, companyId, contactId });
		return {
			tickets: tickets.map((ticket) => ({
				id: ticket.id,
				subject: ticket.subject,
				status: ticket.status,
				priority: ticket.priority,
				companyName: ticket.companies?.name ?? null,
				contactName: ticket.contacts?.name ?? null,
				createdAt: ticket.created_at
			}))
		};
	}
});
