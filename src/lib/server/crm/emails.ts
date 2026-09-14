import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import { unwrap } from './unwrap';

/**
 * Data access for synced email — `email_threads`, `email_messages` and the
 * tables around them — as a record page and the /email feed read it.
 *
 * Every read runs on the request-scoped client, so the visibility rule in
 * the email_sync migration (`private.mailbox_link_visible()`) decides what
 * comes back: a private mailbox's mail for its owner and the org's managers
 * only, a shared one's for everyone. Threads arrive assembled — messages
 * oldest first, each with its participants, the mailboxes holding it and
 * the records it is filed on — from a few flat queries joined here rather
 * than one deep embed, so each table's policy applies on its own.
 */

export type EmailParticipant = Pick<
	Tables<'email_participants'>,
	'role' | 'address' | 'display_name' | 'contact_id'
>;

/** One mailbox's copy of a message: whose, and how it is shared. */
export type EmailCopy = {
	id: string;
	mailboxId: string;
	mailboxAddress: string;
	holderUserId: string;
	/** Gmail's own thread id in that mailbox — what a reply from it is threaded under. */
	gmailThreadId: string;
	isSent: boolean;
	isPrivate: boolean;
};

export type EmailLink = { entityType: Enums<'crm_entity_type'>; entityId: string };

export type EmailMessageView = {
	id: string;
	threadId: string;
	subject: string | null;
	snippet: string | null;
	bodyText: string | null;
	fromAddress: string;
	fromName: string | null;
	sentAt: string;
	attachmentCount: number;
	participants: EmailParticipant[];
	copies: EmailCopy[];
	links: EmailLink[];
};

export type EmailThreadView = {
	id: string;
	subject: string | null;
	firstMessageAt: string | null;
	lastMessageAt: string | null;
	messageCount: number;
	/** Oldest first — the order a conversation is read in. */
	messages: EmailMessageView[];
};

/** How many threads a record page or the feed shows at once. */
export const THREAD_LIMIT = 50;

/** The threads filed on one record, most recent conversation first. */
export async function listEmailThreadsFor(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: { entityType: Enums<'crm_entity_type'>; entityId: string },
	options: { limit?: number } = {}
): Promise<EmailThreadView[]> {
	const links = unwrap(
		await supabase
			.from('email_message_links')
			.select('message_id')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
	);
	const messageIds = [...new Set(links.map((link) => link.message_id))];
	if (messageIds.length === 0) return [];

	const filed = unwrap(
		await supabase
			.from('email_messages')
			.select('thread_id')
			.eq('org_id', orgId)
			.in('id', messageIds)
	);
	const threadIds = [...new Set(filed.map((row) => row.thread_id))];
	return assembleThreads(supabase, orgId, threadIds, options.limit ?? THREAD_LIMIT);
}

/** The org's latest conversations — what /email lists. */
export async function listRecentEmailThreads(
	supabase: SupabaseClient<Database>,
	orgId: string,
	options: { limit?: number } = {}
): Promise<EmailThreadView[]> {
	const limit = options.limit ?? THREAD_LIMIT;
	const threads = unwrap(
		await supabase
			.from('email_threads')
			.select('id')
			.eq('org_id', orgId)
			.order('last_message_at', { ascending: false })
			.limit(limit)
	);
	return assembleThreads(
		supabase,
		orgId,
		threads.map((thread) => thread.id),
		limit
	);
}

export async function getEmailThread(
	supabase: SupabaseClient<Database>,
	orgId: string,
	threadId: string
): Promise<EmailThreadView | null> {
	const [thread] = await assembleThreads(supabase, orgId, [threadId], 1);
	return thread ?? null;
}

/** One message with its thread's context — what a reply is written against. */
export async function getEmailMessage(
	supabase: SupabaseClient<Database>,
	orgId: string,
	messageId: string
): Promise<(Tables<'email_messages'> & { copies: EmailCopy[] }) | null> {
	const message = unwrap(
		await supabase
			.from('email_messages')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', messageId)
			.maybeSingle()
	);
	if (!message) return null;
	const copies = await loadCopies(supabase, orgId, [message.id]);
	return { ...message, copies: copies.get(message.id) ?? [] };
}

/** Flag or unflag one mailbox's copy; RLS lets only the mailbox's owner. */
export async function setMailboxMessagePrivate(
	supabase: SupabaseClient<Database>,
	orgId: string,
	mailboxMessageId: string,
	isPrivate: boolean
): Promise<void> {
	const updated = unwrap(
		await supabase
			.from('mailbox_messages')
			.update({ is_private: isPrivate })
			.eq('org_id', orgId)
			.eq('id', mailboxMessageId)
			.select('id')
	);
	if (updated.length === 0) {
		throw new Error('That message is not in your mailbox, or it no longer exists.');
	}
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

async function assembleThreads(
	supabase: SupabaseClient<Database>,
	orgId: string,
	threadIds: readonly string[],
	limit: number
): Promise<EmailThreadView[]> {
	if (threadIds.length === 0) return [];

	const threads = unwrap(
		await supabase
			.from('email_threads')
			.select('id, subject, first_message_at, last_message_at, message_count')
			.eq('org_id', orgId)
			.in('id', [...threadIds])
			.order('last_message_at', { ascending: false })
			.limit(limit)
	);
	if (threads.length === 0) return [];

	const messages = unwrap(
		await supabase
			.from('email_messages')
			.select(
				'id, thread_id, subject, snippet, body_text, from_address, from_name, sent_at, attachment_count'
			)
			.eq('org_id', orgId)
			.in(
				'thread_id',
				threads.map((thread) => thread.id)
			)
			.order('sent_at')
	);
	const messageIds = messages.map((message) => message.id);

	const [participants, copies, links] = await Promise.all([
		loadParticipants(supabase, orgId, messageIds),
		loadCopies(supabase, orgId, messageIds),
		loadLinks(supabase, orgId, messageIds)
	]);

	const byThread = new Map<string, EmailMessageView[]>();
	for (const message of messages) {
		const view: EmailMessageView = {
			id: message.id,
			threadId: message.thread_id,
			subject: message.subject,
			snippet: message.snippet,
			bodyText: message.body_text,
			fromAddress: message.from_address,
			fromName: message.from_name,
			sentAt: message.sent_at,
			attachmentCount: message.attachment_count,
			participants: participants.get(message.id) ?? [],
			copies: copies.get(message.id) ?? [],
			links: links.get(message.id) ?? []
		};
		const list = byThread.get(message.thread_id);
		if (list) list.push(view);
		else byThread.set(message.thread_id, [view]);
	}

	return threads.flatMap((thread) => {
		const list = byThread.get(thread.id);
		// A thread whose every message is somebody else's private mail has
		// nothing for this reader; RLS already hid it, this keeps the type honest.
		if (!list || list.length === 0) return [];
		return [
			{
				id: thread.id,
				subject: thread.subject,
				firstMessageAt: thread.first_message_at,
				lastMessageAt: thread.last_message_at,
				messageCount: thread.message_count,
				messages: list
			}
		];
	});
}

async function loadParticipants(
	supabase: SupabaseClient<Database>,
	orgId: string,
	messageIds: readonly string[]
): Promise<Map<string, EmailParticipant[]>> {
	const out = new Map<string, EmailParticipant[]>();
	if (messageIds.length === 0) return out;
	const rows = unwrap(
		await supabase
			.from('email_participants')
			.select('message_id, role, address, display_name, contact_id')
			.eq('org_id', orgId)
			.in('message_id', [...messageIds])
			.order('created_at')
	);
	for (const row of rows) {
		const entry = {
			role: row.role,
			address: row.address,
			display_name: row.display_name,
			contact_id: row.contact_id
		};
		const list = out.get(row.message_id);
		if (list) list.push(entry);
		else out.set(row.message_id, [entry]);
	}
	return out;
}

async function loadCopies(
	supabase: SupabaseClient<Database>,
	orgId: string,
	messageIds: readonly string[]
): Promise<Map<string, EmailCopy[]>> {
	const out = new Map<string, EmailCopy[]>();
	if (messageIds.length === 0) return out;
	const [rows, mailboxes] = await Promise.all([
		unwrap(
			await supabase
				.from('mailbox_messages')
				.select('id, message_id, mailbox_id, gmail_thread_id, is_sent, is_private')
				.eq('org_id', orgId)
				.in('message_id', [...messageIds])
		),
		unwrap(
			await supabase.from('mailboxes').select('id, email_address, user_id').eq('org_id', orgId)
		)
	]);
	const addressOf = new Map(mailboxes.map((m) => [m.id, m]));
	for (const row of rows) {
		const mailbox = addressOf.get(row.mailbox_id);
		if (!mailbox) continue;
		const entry: EmailCopy = {
			id: row.id,
			mailboxId: row.mailbox_id,
			mailboxAddress: mailbox.email_address,
			holderUserId: mailbox.user_id,
			gmailThreadId: row.gmail_thread_id,
			isSent: row.is_sent,
			isPrivate: row.is_private
		};
		const list = out.get(row.message_id);
		if (list) list.push(entry);
		else out.set(row.message_id, [entry]);
	}
	return out;
}

async function loadLinks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	messageIds: readonly string[]
): Promise<Map<string, EmailLink[]>> {
	const out = new Map<string, EmailLink[]>();
	if (messageIds.length === 0) return out;
	const rows = unwrap(
		await supabase
			.from('email_message_links')
			.select('message_id, entity_type, entity_id')
			.eq('org_id', orgId)
			.in('message_id', [...messageIds])
	);
	for (const row of rows) {
		const entry = { entityType: row.entity_type, entityId: row.entity_id };
		const list = out.get(row.message_id);
		if (list) list.push(entry);
		else out.set(row.message_id, [entry]);
	}
	return out;
}
