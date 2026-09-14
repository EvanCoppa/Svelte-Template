import { describe, expect, it } from 'vitest';
import type { GmailMessage } from '$lib/server/integrations/google/gmail';
import { ORG_ID, supabaseMock, supabaseMockSequence } from '$lib/server/crm/test-support';
import { ingestMessage, type MailboxRow } from './ingest';
import type { MatchIndex } from './match';

/**
 * Ingestion from the outside: what is refused before a row is written, and
 * the rows one new message becomes.
 */

const MAILBOX: MailboxRow = {
	id: 'a6000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	user_id: '00000000-0000-0000-0000-000000000001',
	provider: 'google',
	email_address: 'dev@example.com',
	visibility: 'shared',
	status: 'active',
	history_id: '100',
	watch_expires_at: null,
	backfilled_at: null,
	last_synced_at: null,
	last_error: null,
	created_at: '2026-09-01T00:00:00Z',
	updated_at: '2026-09-01T00:00:00Z'
};

const INDEX: MatchIndex = {
	contactsByEmail: new Map([
		['lucius@wayne.example.com', { id: 'contact-lucius', companyId: 'company-wayne' }]
	]),
	companiesByDomain: new Map([['stark.example.com', 'company-stark']]),
	memberAddresses: new Set(['dev@example.com', 'evan@example.com'])
};

function gmailMessage(
	headers: Record<string, string>,
	overrides: Partial<GmailMessage> = {}
): GmailMessage {
	return {
		id: 'gm-1',
		threadId: 'gt-1',
		labelIds: ['INBOX'],
		snippet: 'Could your team come by?',
		historyId: '101',
		internalDate: '1757844000000',
		sizeEstimate: 1200,
		payload: {
			mimeType: 'text/plain',
			headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
			body: { size: 20, data: Buffer.from('Could your team come by?').toString('base64url') }
		},
		...overrides
	};
}

const FROM_LUCIUS = {
	From: 'Lucius Fox <lucius@wayne.example.com>',
	To: 'dev@example.com',
	Subject: 'Roof inspection',
	'Message-ID': '<abc@wayne.example.com>'
};

describe('ingestMessage — what is refused before anything is written', () => {
	it('skips drafts, spam, the bin and chats by label', async () => {
		const { supabase, from } = supabaseMock({ data: [] });
		for (const label of ['DRAFT', 'SPAM', 'TRASH', 'CHAT']) {
			const outcome = await ingestMessage(
				supabase,
				MAILBOX,
				gmailMessage(FROM_LUCIUS, { labelIds: [label] }),
				INDEX,
				[]
			);
			expect(outcome).toBe('skipped');
		}
		expect(from).not.toHaveBeenCalled();
	});

	it('skips a message that touches an excluded address or domain', async () => {
		const { supabase, from } = supabaseMock({ data: [] });
		expect(
			await ingestMessage(supabase, MAILBOX, gmailMessage(FROM_LUCIUS), INDEX, [
				'@wayne.example.com'
			])
		).toBe('skipped');
		expect(from).not.toHaveBeenCalled();
	});

	it('skips a message that matches no record', async () => {
		const { supabase, from } = supabaseMock({ data: [] });
		const stranger = { ...FROM_LUCIUS, From: 'someone@gmail.com' };
		expect(await ingestMessage(supabase, MAILBOX, gmailMessage(stranger), INDEX, [])).toBe(
			'skipped'
		);
		expect(from).not.toHaveBeenCalled();
	});

	it('skips a thread between members alone', async () => {
		const { supabase, from } = supabaseMock({ data: [] });
		const internal = { ...FROM_LUCIUS, From: 'evan@example.com', To: 'dev@example.com' };
		expect(await ingestMessage(supabase, MAILBOX, gmailMessage(internal), INDEX, [])).toBe(
			'skipped'
		);
		expect(from).not.toHaveBeenCalled();
	});
});

describe('ingestMessage — a new message becomes rows', () => {
	it('stores the message in a new thread with its participants, links and the mailbox copy', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			// findMessage: not held yet
			{ data: [] },
			// resolveThreadId: nothing cited (no In-Reply-To), no sibling by Gmail thread
			{ data: [] },
			// a new thread
			{ data: { id: 'thread-1' } },
			// the message
			{ data: { id: 'message-1' } },
			// participants, links, the copy
			{ data: null },
			{ data: null },
			{ data: null }
		]);

		expect(await ingestMessage(supabase, MAILBOX, gmailMessage(FROM_LUCIUS), INDEX, [])).toBe(
			'stored'
		);

		const tables = from.mock.calls.map(([table]) => table);
		expect(tables).toEqual([
			'email_messages',
			'mailbox_messages',
			'email_threads',
			'email_messages',
			'email_participants',
			'email_message_links',
			'mailbox_messages'
		]);

		// The thread takes the subject; the message its headers and text.
		expect(builder.insert).toHaveBeenCalledWith({ org_id: ORG_ID, subject: 'Roof inspection' });
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				org_id: ORG_ID,
				thread_id: 'thread-1',
				rfc_message_id: 'abc@wayne.example.com',
				subject: 'Roof inspection',
				body_text: 'Could your team come by?',
				from_address: 'lucius@wayne.example.com',
				from_name: 'Lucius Fox',
				sent_at: '2025-09-14T10:00:00.000Z',
				attachment_count: 0
			})
		);
		// Every address, the contact resolved where there is one.
		expect(builder.insert).toHaveBeenCalledWith([
			expect.objectContaining({
				role: 'from',
				address: 'lucius@wayne.example.com',
				contact_id: 'contact-lucius'
			}),
			expect.objectContaining({ role: 'to', address: 'dev@example.com', contact_id: null })
		]);
		// Filed on the person and their company; the copy says it was received.
		expect(builder.upsert).toHaveBeenCalledWith(
			[
				expect.objectContaining({ entity_type: 'contact', entity_id: 'contact-lucius' }),
				expect.objectContaining({ entity_type: 'company', entity_id: 'company-wayne' })
			],
			{ onConflict: 'message_id,entity_type,entity_id', ignoreDuplicates: true }
		);
		expect(builder.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				mailbox_id: MAILBOX.id,
				message_id: 'message-1',
				gmail_message_id: 'gm-1',
				gmail_thread_id: 'gt-1',
				is_sent: false
			}),
			{ onConflict: 'mailbox_id,gmail_message_id' }
		);
	});

	it('re-asserts the links on a message the org already holds and writes no second copy of it', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			// findMessage: already stored by a colleague's mailbox
			{ data: [{ id: 'message-1' }] },
			{ data: null },
			{ data: null }
		]);
		const sent = gmailMessage(FROM_LUCIUS, { labelIds: ['SENT'] });
		expect(await ingestMessage(supabase, MAILBOX, sent, INDEX, [])).toBe('stored');
		expect(from.mock.calls.map(([table]) => table)).toEqual([
			'email_messages',
			'email_message_links',
			'mailbox_messages'
		]);
		expect(builder.insert).not.toHaveBeenCalled();
		expect(builder.upsert).toHaveBeenCalledWith(expect.objectContaining({ is_sent: true }), {
			onConflict: 'mailbox_id,gmail_message_id'
		});
	});

	it('files a vouched-for record even when nothing matches', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [{ id: 'message-1' }] },
			{ data: null },
			{ data: null }
		]);
		const stranger = { ...FROM_LUCIUS, From: 'someone@gmail.com' };
		const outcome = await ingestMessage(supabase, MAILBOX, gmailMessage(stranger), INDEX, [], {
			extraLinks: [{ entityType: 'deal', entityId: 'deal-1', source: 'manual' }]
		});
		expect(outcome).toBe('stored');
		expect(builder.upsert).toHaveBeenCalledWith(
			[expect.objectContaining({ entity_type: 'deal', entity_id: 'deal-1', source: 'manual' })],
			expect.anything()
		);
	});
});
