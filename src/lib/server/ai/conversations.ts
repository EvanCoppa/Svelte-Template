import type { SupabaseClient } from '@supabase/supabase-js';
import type { UIMessage } from 'ai';
import type { Database, Json, Tables } from '$lib/database.types';
import { ensure, unwrap, unwrapDeleted } from '$lib/server/crm/unwrap';

/**
 * Data access for `assistant_conversations` and `assistant_messages` — the
 * same contract as the crm modules: the request-scoped client plus ids from
 * the request, RLS as the boundary, `unwrap` as the error contract.
 *
 * Messages are the AI SDK's `UIMessage`s stored verbatim, one row each, in
 * the order the SDK hands them back. The stream endpoint is the only writer:
 * it saves the whole thread from the stream's `onEnd`, and trims it before
 * the model answers again when the user regenerates or edits. Rows come back
 * as `UIMessage`s so a page load can hydrate the Chat directly; the endpoint
 * validates them against the current tools with `validateUIMessages` before
 * they reach the model, as the SDK's persistence guide recommends.
 */

export type Conversation = Tables<'assistant_conversations'>;

/** What the history rail shows. */
export type ConversationSummary = Pick<Conversation, 'id' | 'title' | 'updated_at'>;

export async function listConversations(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string
): Promise<ConversationSummary[]> {
	return unwrap(
		await supabase
			.from('assistant_conversations')
			.select('id, title, updated_at')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.order('updated_at', { ascending: false })
	);
}

export async function getConversation(
	supabase: SupabaseClient<Database>,
	orgId: string,
	conversationId: string
): Promise<Conversation | null> {
	return unwrap(
		await supabase
			.from('assistant_conversations')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', conversationId)
			.maybeSingle()
	);
}

/**
 * The conversation for an id the browser minted, created on its first turn.
 * An id that belongs to someone else's thread is invisible under RLS, so the
 * insert then hits the primary key and fails loudly instead of quietly
 * writing into another member's conversation.
 */
export async function ensureConversation(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	conversationId: string
): Promise<Conversation> {
	const existing = await getConversation(supabase, orgId, conversationId);
	if (existing) return existing;
	return unwrap(
		await supabase
			.from('assistant_conversations')
			.insert({ id: conversationId, org_id: orgId, user_id: userId })
			.select()
			.single()
	);
}

/** A message as stored: the UIMessage's fields, `parts` and `metadata` still as the database's `Json`. */
export type StoredMessage = Pick<
	Tables<'assistant_messages'>,
	'id' | 'role' | 'parts' | 'metadata'
>;

/**
 * The thread in order, as stored. `toUIMessages()` in `messages.ts` turns the
 * rows back into validated UIMessages — the SDK's own check, against the
 * current tools — which is the one conversion between the two shapes.
 */
export async function loadMessages(
	supabase: SupabaseClient<Database>,
	conversationId: string
): Promise<StoredMessage[]> {
	return unwrap(
		await supabase
			.from('assistant_messages')
			.select('id, role, parts, metadata')
			.eq('conversation_id', conversationId)
			.order('position', { ascending: true })
	);
}

/**
 * Save the whole thread, keyed by message id: an existing message is updated
 * in place (an approval response lands on the assistant message that asked
 * for it), a new one is appended. `position` is the array index, so the
 * order the SDK produced is the order the thread is read back in.
 */
export async function saveMessages(
	supabase: SupabaseClient<Database>,
	conversationId: string,
	messages: UIMessage[]
): Promise<void> {
	if (messages.length === 0) return;
	const rows = messages.map((message, position) => ({
		conversation_id: conversationId,
		id: message.id,
		role: message.role,
		position,
		parts: toJson(message.parts),
		metadata: message.metadata == null ? null : toJson(message.metadata)
	}));
	ensure(
		await supabase.from('assistant_messages').upsert(rows, { onConflict: 'conversation_id,id' })
	);
}

/**
 * Drop a message and everything after it — regenerating an answer or editing
 * a prompt rewrites the tail, and the rows must go before the model writes
 * the new one. A message that is not in the thread is a no-op.
 */
export async function deleteMessagesFrom(
	supabase: SupabaseClient<Database>,
	conversationId: string,
	messageId: string
): Promise<void> {
	const row = unwrap(
		await supabase
			.from('assistant_messages')
			.select('position')
			.eq('conversation_id', conversationId)
			.eq('id', messageId)
			.maybeSingle()
	);
	if (!row) return;
	ensure(
		await supabase
			.from('assistant_messages')
			.delete()
			.eq('conversation_id', conversationId)
			.gte('position', row.position)
	);
}

export async function updateConversationTitle(
	supabase: SupabaseClient<Database>,
	orgId: string,
	conversationId: string,
	title: string
): Promise<Conversation> {
	return unwrap(
		await supabase
			.from('assistant_conversations')
			.update({ title })
			.eq('org_id', orgId)
			.eq('id', conversationId)
			.select()
			.single()
	);
}

/** Messages cascade with the conversation. */
export async function deleteConversation(
	supabase: SupabaseClient<Database>,
	orgId: string,
	conversationId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('assistant_conversations')
			.delete()
			.eq('org_id', orgId)
			.eq('id', conversationId)
			.select('id'),
		'Conversation'
	);
}

/**
 * A UIMessage's parts and metadata are plain data, but their TypeScript shape
 * is wider than `Json` (fields typed `unknown`). A JSON round trip both
 * proves they serialize and drops `undefined` fields, which jsonb cannot hold
 * anyway.
 */
function toJson(value: UIMessage['parts'] | NonNullable<UIMessage['metadata']>): Json {
	// SAFETY: JSON.parse of JSON.stringify output is, by construction, a Json value.
	return JSON.parse(JSON.stringify(value)) as Json;
}
