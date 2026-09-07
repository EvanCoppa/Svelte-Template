import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import {
	createAgentUIStreamResponse,
	createIdGenerator,
	isToolUIPart,
	type LanguageModel
} from 'ai';
import type { StreamRequest } from '$lib/ai/schemas';
import type { AssistantUIMessage } from '$lib/ai/types';
import type { Database } from '$lib/database.types';
import { createAssistantAgent } from './agent';
import type { AssistantToolContext } from './context';
import {
	deleteMessagesFrom,
	ensureConversation,
	loadMessages,
	saveMessages,
	updateConversationTitle
} from './conversations';
import { toUIMessage, toUIMessages } from './messages';
import { generateConversationTitle } from './title';

/**
 * One turn of the assistant, from a validated request to the SDK's UI message
 * stream. The endpoint (`src/routes/(app)/assistant/stream/+server.ts`) parses
 * the body, resolves the provider and calls this; everything it depends on
 * arrives as a parameter, so a test drives the real agent and the real
 * conversation code over the SDK's mock model and a fake client.
 *
 * The server owns the thread. The browser sends only the last message plus
 * the SDK's trigger; this loads the stored thread, folds the incoming message
 * in, runs the agent and saves the whole thread from the stream's `onEnd`.
 */

export type AssistantTurn = {
	request: StreamRequest;
	/** The request: client, org (feature modes, grants) and caller. */
	context: AssistantToolContext;
	model: LanguageModel;
	/** Recorded on each answer's metadata. */
	modelId: string;
	userName?: string | undefined;
	/** Injectable for tests; the real one asks the model. */
	generateTitle?: typeof generateConversationTitle;
};

/** Server-side ids for assistant messages, stable before they are stored. */
const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

export async function streamAssistantTurn({
	request,
	context,
	model,
	modelId,
	userName,
	generateTitle = generateConversationTitle
}: AssistantTurn): Promise<Response> {
	const { supabase, orgId, userId } = context;
	const conversationId = request.id;

	const conversation = await ensureConversation(supabase, orgId, userId, conversationId);
	const stored = await toUIMessages(await loadMessages(supabase, conversationId));

	let messages: AssistantUIMessage[];
	if (request.trigger === 'regenerate-message') {
		messages = await regenerateFrom(supabase, conversationId, stored, request.messageId);
	} else {
		const incoming = await toUIMessage(request.message);
		messages = await mergeIncoming(supabase, conversationId, stored, incoming);
	}

	// Title the thread from its opening message, before the first answer
	// streams: by the time the turn ends and the page refreshes its rail, the
	// title is already there — no race with the stream's end.
	if (!conversation.title && stored.length === 0) {
		const opening = messages.find((m) => m.role === 'user');
		const title = opening ? await generateTitle(model, textOf(opening)) : null;
		if (title) await updateConversationTitle(supabase, orgId, conversationId, title);
	}

	return createAgentUIStreamResponse({
		agent: createAssistantAgent({ model, context, timeZone: request.timeZone, userName }),
		uiMessages: messages,
		originalMessages: messages,
		generateMessageId,
		messageMetadata: ({ part }) => {
			if (part.type === 'start') return { createdAt: Date.now(), model: modelId };
			if (part.type === 'finish') {
				return {
					inputTokens: part.totalUsage.inputTokens,
					outputTokens: part.totalUsage.outputTokens
				};
			}
			return undefined;
		},
		onEnd: async ({ messages: finalMessages }) => {
			try {
				await saveMessages(supabase, conversationId, finalMessages);
			} catch (cause) {
				// The answer has already streamed; a failed save must not turn it
				// into an error the user sees. It is logged so it is diagnosable.
				console.error('[assistant] failed to save the thread', { conversationId, cause });
			}
		},
		onError: (cause) => {
			console.error('[assistant] stream error', { conversationId, cause });
			return 'The assistant hit an error. Try again.';
		}
	});
}

/**
 * Fold the browser's message into the stored thread.
 *
 *   a new user message         -> appended
 *   a resent user message      -> the thread restarts from it (an edit)
 *   the thread's tail, back    -> only its approval answers are taken; the
 *   from the browser              stored copy stays the record of what the
 *                                 model asked, so the browser cannot rewrite
 *                                 a tool call it is approving
 */
async function mergeIncoming(
	supabase: SupabaseClient<Database>,
	conversationId: string,
	stored: AssistantUIMessage[],
	incoming: AssistantUIMessage
): Promise<AssistantUIMessage[]> {
	if (incoming.role === 'assistant') {
		const tail = stored.at(-1);
		if (!tail || tail.role !== 'assistant' || tail.id !== incoming.id) {
			throw error(400, 'Only the thread’s latest assistant message can be sent back.');
		}
		return [...stored.slice(0, -1), applyApprovalResponses(tail, incoming)];
	}

	const index = stored.findIndex((message) => message.id === incoming.id);
	if (index === -1) return [...stored, incoming];
	await deleteMessagesFrom(supabase, conversationId, incoming.id);
	return [...stored.slice(0, index), incoming];
}

/**
 * Cut the thread for a regeneration, mirroring `Chat.regenerate`: an
 * assistant message is dropped (the model answers again), a user message is
 * kept (the model answers it again). No id means the thread's last message.
 */
async function regenerateFrom(
	supabase: SupabaseClient<Database>,
	conversationId: string,
	stored: AssistantUIMessage[],
	messageId: string | undefined
): Promise<AssistantUIMessage[]> {
	const index =
		messageId === undefined
			? stored.length - 1
			: stored.findIndex((message) => message.id === messageId);
	if (index === -1) throw error(400, 'There is no message to regenerate.');

	const keep = stored[index].role === 'assistant' ? index : index + 1;
	const dropped = stored[keep];
	if (dropped) await deleteMessagesFrom(supabase, conversationId, dropped.id);
	return stored.slice(0, keep);
}

/**
 * Copy the user's approval decisions from the browser's copy of the tail onto
 * the stored one — by approval id, and only onto parts still waiting for one.
 */
function applyApprovalResponses(
	stored: AssistantUIMessage,
	incoming: AssistantUIMessage
): AssistantUIMessage {
	const responses = new Map<string, { approved: boolean; reason: string | undefined }>();
	for (const part of incoming.parts) {
		if (isToolUIPart(part) && part.state === 'approval-responded') {
			responses.set(part.approval.id, {
				approved: part.approval.approved,
				reason: part.approval.reason
			});
		}
	}
	if (responses.size === 0) return stored;

	return {
		...stored,
		parts: stored.parts.map((part) => {
			if (!isToolUIPart(part) || part.state !== 'approval-requested') return part;
			const response = responses.get(part.approval.id);
			if (!response) return part;
			// SAFETY: an approval-requested part plus `approved` is exactly the
			// SDK's approval-responded part; TS cannot follow the spread into the union.
			return {
				...part,
				state: 'approval-responded',
				approval: { ...part.approval, ...response }
			} as AssistantUIMessage['parts'][number];
		})
	};
}

function textOf(message: AssistantUIMessage): string {
	return message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join(' ');
}
