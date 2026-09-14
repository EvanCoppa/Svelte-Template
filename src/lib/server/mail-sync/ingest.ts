import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import type { GmailMessage } from '$lib/server/integrations/google/gmail';
import { parseMessagePayload, type Address } from '$lib/server/integrations/google/mime';
import { unwrap, ensure } from '$lib/server/crm/unwrap';
import {
	companyDomains,
	isExcluded,
	matchMessage,
	normalizeAddress,
	type MatchIndex,
	type MatchLink
} from './match';
import { resolveThreadId } from './threads';

/**
 * One Gmail message becomes rows — or nothing.
 *
 * Idempotent by construction: the message is keyed on its Message-ID per
 * org, the mailbox's copy on Gmail's id per mailbox, the links on their
 * triple, so a page re-run after a crash, a push that repeats a history
 * record, or a second member's mailbox holding the same exchange all land on
 * rows that already exist. A message is stored only when the match files it
 * on at least one record; the mailbox's exclusions and the internal-thread
 * rule are checked before anything is written.
 */

export type MailboxRow = Tables<'mailboxes'>;

/** Gmail labels whose messages are never read into the org. */
const SKIPPED_LABELS = new Set(['DRAFT', 'SPAM', 'TRASH', 'CHAT']);

/** The body column's check constraint, minus room for the trigger to count bytes. */
const BODY_LIMIT = 200_000;

export type IngestOutcome = 'stored' | 'skipped';

/**
 * Everything ingestion needs to know about an org, read once per job: who
 * the contacts and companies are, and which addresses are the team's own.
 */
export async function buildMatchIndex(
	admin: SupabaseClient<Database>,
	orgId: string
): Promise<MatchIndex> {
	const [contacts, companies, mailboxes, members] = await Promise.all([
		unwrap(
			await admin
				.from('contacts')
				.select('id, email, company_id')
				.eq('org_id', orgId)
				.not('email', 'is', null)
		),
		unwrap(await admin.from('companies').select('id, website, email').eq('org_id', orgId)),
		unwrap(await admin.from('mailboxes').select('email_address').eq('org_id', orgId)),
		unwrap(await admin.from('organization_members').select('user_id').eq('org_id', orgId))
	]);
	const profiles =
		members.length > 0
			? unwrap(
					await admin
						.from('profiles')
						.select('email')
						.in(
							'id',
							members.map((m) => m.user_id)
						)
				)
			: [];

	const contactsByEmail = new Map<string, { id: string; companyId: string | null }>();
	for (const contact of contacts) {
		if (!contact.email) continue;
		const address = normalizeAddress(contact.email);
		// Two contacts on one address: the first by id wins, deterministically.
		if (!contactsByEmail.has(address)) {
			contactsByEmail.set(address, { id: contact.id, companyId: contact.company_id });
		}
	}

	const companiesByDomain = new Map<string, string>();
	for (const company of companies) {
		for (const domain of companyDomains(company)) {
			if (!companiesByDomain.has(domain)) companiesByDomain.set(domain, company.id);
		}
	}

	const memberAddresses = new Set<string>();
	for (const mailbox of mailboxes) memberAddresses.add(normalizeAddress(mailbox.email_address));
	for (const profile of profiles) {
		if (profile.email) memberAddresses.add(normalizeAddress(profile.email));
	}

	return { contactsByEmail, companiesByDomain, memberAddresses };
}

/** The patterns one mailbox never syncs. */
export async function loadExclusions(
	admin: SupabaseClient<Database>,
	mailboxId: string
): Promise<string[]> {
	const rows = unwrap(
		await admin.from('mailbox_exclusions').select('pattern').eq('mailbox_id', mailboxId)
	);
	return rows.map((row) => row.pattern);
}

export async function ingestMessage(
	admin: SupabaseClient<Database>,
	mailbox: MailboxRow,
	message: GmailMessage,
	index: MatchIndex,
	exclusions: readonly string[],
	options: {
		/**
		 * Records the caller vouches for — a message sent from a record page is
		 * filed on that record whatever the addresses match, and stored even
		 * when nothing else matches.
		 */
		extraLinks?: readonly MatchLink[];
	} = {}
): Promise<IngestOutcome> {
	if (message.labelIds.some((label) => SKIPPED_LABELS.has(label))) return 'skipped';

	const parsed = parseMessagePayload(message);
	const participants = collectParticipants(parsed);
	const addresses = participants.map((p) => p.address);
	if (addresses.length === 0) return 'skipped';
	if (addresses.some((address) => isExcluded(address, exclusions))) return 'skipped';

	const match = matchMessage(addresses, index);
	const extra = options.extraLinks ?? [];
	if (extra.length === 0 && (match.internalOnly || match.links.length === 0)) return 'skipped';
	const links = [...match.links];
	for (const link of extra) {
		if (!links.some((l) => l.entityType === link.entityType && l.entityId === link.entityId)) {
			links.push(link);
		}
	}

	const rfcMessageId = parsed.rfcMessageId ?? `gmail:${mailbox.id}:${message.id}`;
	const sentAt = new Date(Number(message.internalDate)).toISOString();

	// The message the org already holds, or a new one in the right thread.
	let messageId = await findMessage(admin, mailbox.org_id, rfcMessageId);
	if (!messageId) {
		const threadId = await resolveThreadId(admin, {
			orgId: mailbox.org_id,
			mailboxId: mailbox.id,
			gmailThreadId: message.threadId,
			inReplyTo: parsed.inReplyTo,
			references: parsed.references,
			subject: parsed.subject
		});
		const inserted = await admin
			.from('email_messages')
			.insert({
				org_id: mailbox.org_id,
				thread_id: threadId,
				rfc_message_id: rfcMessageId,
				in_reply_to: parsed.inReplyTo,
				reference_ids: parsed.references,
				subject: parsed.subject,
				snippet: message.snippet || null,
				body_text: parsed.bodyText ? parsed.bodyText.slice(0, BODY_LIMIT) : null,
				from_address: parsed.from?.address ?? addresses[0],
				from_name: parsed.from?.name ?? null,
				sent_at: sentAt,
				attachment_count: parsed.attachmentCount,
				size_estimate: message.sizeEstimate
			})
			.select('id')
			.single();
		if (inserted.error) {
			// Another worker stored it between the lookup and the insert.
			messageId = await findMessage(admin, mailbox.org_id, rfcMessageId);
			if (!messageId) throw new Error(inserted.error.message, { cause: inserted.error });
		} else {
			const storedId = inserted.data.id;
			messageId = storedId;
			ensure(
				await admin.from('email_participants').insert(
					participants.map((participant) => ({
						org_id: mailbox.org_id,
						message_id: storedId,
						role: participant.role,
						address: participant.address,
						display_name: participant.name,
						contact_id: match.contactsByAddress.get(participant.address) ?? null
					}))
				)
			);
		}
	}

	// Links are re-asserted on every pass: a contact added since the message
	// was first stored files it on one more record.
	ensure(
		await admin.from('email_message_links').upsert(
			links.map((link) => ({
				org_id: mailbox.org_id,
				message_id: messageId,
				entity_type: link.entityType,
				entity_id: link.entityId,
				source: link.source,
				created_by: null
			})),
			{ onConflict: 'message_id,entity_type,entity_id', ignoreDuplicates: true }
		)
	);

	ensure(
		await admin.from('mailbox_messages').upsert(
			{
				org_id: mailbox.org_id,
				mailbox_id: mailbox.id,
				message_id: messageId,
				gmail_message_id: message.id,
				gmail_thread_id: message.threadId,
				label_ids: message.labelIds,
				is_sent: message.labelIds.includes('SENT'),
				synced_at: new Date().toISOString()
			},
			{ onConflict: 'mailbox_id,gmail_message_id' }
		)
	);

	return 'stored';
}

/**
 * A message deleted at Google, or moved to spam or the bin: the mailbox lets
 * go of its copy, and the orphan trigger removes the message when nobody
 * else holds it.
 */
export async function forgetMessage(
	admin: SupabaseClient<Database>,
	mailboxId: string,
	gmailMessageId: string
): Promise<void> {
	ensure(
		await admin
			.from('mailbox_messages')
			.delete()
			.eq('mailbox_id', mailboxId)
			.eq('gmail_message_id', gmailMessageId)
	);
}

/** The Gmail ids of this mailbox's copies among `ids` — what a sync page may skip fetching. */
export async function heldGmailIds(
	admin: SupabaseClient<Database>,
	mailboxId: string,
	ids: readonly string[]
): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = unwrap(
		await admin
			.from('mailbox_messages')
			.select('gmail_message_id')
			.eq('mailbox_id', mailboxId)
			.in('gmail_message_id', [...ids])
	);
	return new Set(rows.map((row) => row.gmail_message_id));
}

async function findMessage(
	admin: SupabaseClient<Database>,
	orgId: string,
	rfcMessageId: string
): Promise<string | null> {
	const rows = unwrap(
		await admin
			.from('email_messages')
			.select('id')
			.eq('org_id', orgId)
			.eq('rfc_message_id', rfcMessageId)
			.limit(1)
	);
	return rows[0]?.id ?? null;
}

type Participant = { role: Enums<'email_participant_role'>; address: string; name: string | null };

/** Every address on the message, each once per role, lower-cased. */
function collectParticipants(parsed: ReturnType<typeof parseMessagePayload>): Participant[] {
	const out: Participant[] = [];
	const seen = new Set<string>();
	const push = (role: Participant['role'], entries: readonly Address[]) => {
		for (const entry of entries) {
			const address = normalizeAddress(entry.address);
			if (!address.includes('@')) continue;
			const key = `${role}:${address}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ role, address, name: entry.name });
		}
	};
	if (parsed.from) push('from', [parsed.from]);
	push('to', parsed.to);
	push('cc', parsed.cc);
	push('bcc', parsed.bcc);
	push('reply_to', parsed.replyTo);
	return out;
}
