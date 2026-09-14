import { tool } from 'ai';
import { z } from 'zod';
import { listEmailThreadsFor, type EmailThreadView } from '$lib/server/crm/emails';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const searchEmailsAccess: ToolAccess = { feature: 'email', level: 'read' };

/** A conversation as the model sees it: enough to name it and to ask for it whole. */
export const emailThreadSummarySchema = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	messageCount: z.number().int(),
	lastMessageAt: z.string().nullable(),
	participants: z.array(z.string()).describe('Names or addresses on the thread, each once.'),
	latestSnippet: z.string().nullable()
});

export function summarizeEmailThread(
	thread: EmailThreadView
): z.infer<typeof emailThreadSummarySchema> {
	const participants = new Set<string>();
	for (const message of thread.messages) {
		for (const participant of message.participants) {
			participants.add(participant.display_name ?? participant.address);
		}
	}
	const latest = thread.messages[thread.messages.length - 1];
	return {
		id: thread.id,
		subject: thread.subject,
		messageCount: thread.messageCount,
		lastMessageAt: thread.lastMessageAt,
		participants: [...participants],
		latestSnippet: latest?.snippet ?? null
	};
}

const MAX_RESULTS = 20;

export const searchEmails = tool({
	description:
		'The email conversations filed on one contact, company or deal — synced from the ' +
		"team's connected mailboxes, newest first. Only mail the caller may see. Returns " +
		'at most 20 threads; call readEmailThread for the messages of one.',
	inputSchema: z
		.object({
			contactId: z.guid().optional().describe('A contact id, from searchContacts.'),
			companyId: z.guid().optional().describe('A company id, from searchCompanies.'),
			dealId: z.guid().optional().describe('A deal id, from listDeals.')
		})
		.refine(
			(input) => [input.contactId, input.companyId, input.dealId].filter(Boolean).length === 1,
			{
				error: 'Name exactly one of contactId, companyId or dealId.'
			}
		),
	outputSchema: z.object({
		threads: z.array(emailThreadSummarySchema),
		total: z.number().int()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ contactId, companyId, dealId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, searchEmailsAccess);
		const entity = contactId
			? { entityType: 'contact' as const, entityId: contactId }
			: companyId
				? { entityType: 'company' as const, entityId: companyId }
				: { entityType: 'deal' as const, entityId: dealId ?? '' };
		const threads = await listEmailThreadsFor(supabase, orgId, entity);
		return {
			threads: threads.slice(0, MAX_RESULTS).map(summarizeEmailThread),
			total: threads.length
		};
	}
});
