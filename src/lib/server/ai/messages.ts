import { validateUIMessages } from 'ai';
import { messageMetadataSchema, type IncomingMessage } from '$lib/ai/schemas';
import type { AssistantUIMessage } from '$lib/ai/types';
import type { StoredMessage } from './conversations';
import { assistantTools } from './tools';

/**
 * Stored rows back into UIMessages, through the SDK's `validateUIMessages`
 * against the current tools and the metadata schema — so a tool part whose
 * tool has since changed shape fails here, before a Chat or a model sees it.
 * The SDK rejects an empty list, and a new thread is one.
 */
export function toUIMessages(rows: StoredMessage[]): Promise<AssistantUIMessage[]> {
	if (rows.length === 0) return Promise.resolve([]);
	return validateUIMessages<AssistantUIMessage>({
		messages: rows.map((row) => ({
			id: row.id,
			role: row.role,
			parts: row.parts,
			metadata: row.metadata ?? undefined
		})),
		tools: assistantTools,
		metadataSchema: messageMetadataSchema
	});
}

/** The message the browser posted, validated the same way. */
export async function toUIMessage(message: IncomingMessage): Promise<AssistantUIMessage> {
	const [validated] = await validateUIMessages<AssistantUIMessage>({
		messages: [message],
		tools: assistantTools,
		metadataSchema: messageMetadataSchema
	});
	return validated;
}
