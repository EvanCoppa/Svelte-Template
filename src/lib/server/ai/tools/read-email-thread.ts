import { tool } from 'ai';
import { z } from 'zod';
import { getEmailThread } from '$lib/server/crm/emails';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const readEmailThreadAccess: ToolAccess = { feature: 'email', level: 'read' };

/** Each message's text is cut here so a long thread fits the model's context. */
const BODY_CHARS = 4000;
const MAX_MESSAGES = 30;

export const readEmailThread = tool({
	description:
		'The messages of one email conversation, oldest first, with their senders, ' +
		'recipients and text — to summarise, quote or answer from. Needs a thread id from ' +
		'searchEmails. Long messages are truncated.',
	inputSchema: z.object({
		threadId: z.guid().describe('The thread id, from searchEmails.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		subject: z.string().nullable(),
		messages: z.array(
			z.object({
				id: z.string(),
				from: z.string(),
				to: z.array(z.string()),
				cc: z.array(z.string()),
				sentAt: z.string(),
				text: z.string(),
				truncated: z.boolean(),
				attachmentCount: z.number().int()
			})
		)
	}),
	contextSchema: toolContextSchema,
	execute: async ({ threadId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, readEmailThreadAccess);
		const thread = await getEmailThread(supabase, orgId, threadId);
		if (!thread) return { found: false, subject: null, messages: [] };
		return {
			found: true,
			subject: thread.subject,
			messages: thread.messages.slice(-MAX_MESSAGES).map((message) => {
				const text = message.bodyText ?? message.snippet ?? '';
				const who = (role: 'to' | 'cc') =>
					message.participants
						.filter((p) => p.role === role)
						.map((p) => (p.display_name ? `${p.display_name} <${p.address}>` : p.address));
				return {
					id: message.id,
					from: message.fromName
						? `${message.fromName} <${message.fromAddress}>`
						: message.fromAddress,
					to: who('to'),
					cc: who('cc'),
					sentAt: message.sentAt,
					text: text.slice(0, BODY_CHARS),
					truncated: text.length > BODY_CHARS,
					attachmentCount: message.attachmentCount
				};
			})
		};
	}
});
