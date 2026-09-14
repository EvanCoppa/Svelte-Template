import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { stripSubjectPrefixes } from '$lib/server/integrations/google/mime';
import { unwrap } from '$lib/server/crm/unwrap';

/**
 * Which conversation a message belongs to.
 *
 * Gmail has a thread id, but it is Gmail's: two members' mailboxes can file
 * the same exchange under different ids, and a reply that lost its headers
 * starts a new one. So the RFC headers decide first — a message whose
 * In-Reply-To or References names a message the org already holds joins
 * that message's thread — and the mailbox's own Gmail thread id decides
 * second, for the first message of a reply chain the org saw from the other
 * side. Only then is a thread new.
 */

export async function resolveThreadId(
	admin: SupabaseClient<Database>,
	params: {
		orgId: string;
		mailboxId: string;
		gmailThreadId: string;
		inReplyTo: string | null;
		references: readonly string[];
		subject: string | null;
	}
): Promise<string> {
	const cited = [...new Set([params.inReplyTo, ...params.references].filter(isText))];
	if (cited.length > 0) {
		const byHeader = unwrap(
			await admin
				.from('email_messages')
				.select('thread_id')
				.eq('org_id', params.orgId)
				.in('rfc_message_id', cited)
				.limit(1)
		);
		if (byHeader[0]) return byHeader[0].thread_id;
	}

	const siblings = unwrap(
		await admin
			.from('mailbox_messages')
			.select('message_id')
			.eq('mailbox_id', params.mailboxId)
			.eq('gmail_thread_id', params.gmailThreadId)
			.limit(1)
	);
	if (siblings[0]) {
		const byGmail = unwrap(
			await admin
				.from('email_messages')
				.select('thread_id')
				.eq('id', siblings[0].message_id)
				.limit(1)
		);
		if (byGmail[0]) return byGmail[0].thread_id;
	}

	const created = unwrap(
		await admin
			.from('email_threads')
			.insert({
				org_id: params.orgId,
				subject: params.subject ? stripSubjectPrefixes(params.subject) || null : null
			})
			.select('id')
			.single()
	);
	return created.id;
}

function isText(value: string | null | undefined): value is string {
	return typeof value === 'string' && value !== '';
}
