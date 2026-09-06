import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { supabaseMock, supabaseMockSequence } from '$lib/server/crm/test-support';
import {
	deleteConversation,
	deleteMessagesFrom,
	ensureConversation,
	listConversations,
	loadMessages,
	saveMessages,
	updateConversationTitle
} from './conversations';
import { CONVERSATION_ID, ORG_ID, USER_ID } from './test-support';

describe('conversations data access', () => {
	it('lists the member’s own threads in the org, newest first', async () => {
		const rows = [{ id: CONVERSATION_ID, title: 'Leads', updated_at: '2026-09-06T00:00:00Z' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listConversations(supabase, ORG_ID, USER_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('assistant_conversations');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(builder.order).toHaveBeenCalledWith('updated_at', { ascending: false });
	});

	it('returns an existing conversation without inserting', async () => {
		const row = { id: CONVERSATION_ID, title: null };
		const { supabase, builder } = supabaseMock({ data: row });

		await expect(ensureConversation(supabase, ORG_ID, USER_ID, CONVERSATION_ID)).resolves.toEqual(
			row
		);
		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('creates the conversation under the org and the caller on its first turn', async () => {
		const created = { id: CONVERSATION_ID, org_id: ORG_ID, user_id: USER_ID, title: null };
		const { supabase, builder } = supabaseMockSequence([{ data: null }, { data: created }]);

		await expect(ensureConversation(supabase, ORG_ID, USER_ID, CONVERSATION_ID)).resolves.toEqual(
			created
		);
		expect(builder.insert).toHaveBeenCalledWith({
			id: CONVERSATION_ID,
			org_id: ORG_ID,
			user_id: USER_ID
		});
	});

	it('reads the thread back in position order, as stored', async () => {
		const rows = [
			{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: null },
			{
				id: 'a1',
				role: 'assistant',
				parts: [{ type: 'text', text: 'Hello' }],
				metadata: { model: 'm' }
			}
		];
		const { supabase, builder } = supabaseMock({ data: rows });

		await expect(loadMessages(supabase, CONVERSATION_ID)).resolves.toEqual(rows);
		expect(builder.eq).toHaveBeenCalledWith('conversation_id', CONVERSATION_ID);
		expect(builder.order).toHaveBeenCalledWith('position', { ascending: true });
	});

	it('saves the whole thread by message id, with its order and a JSON-clean payload', async () => {
		const { supabase, builder } = supabaseMock({ data: null });
		const messages: UIMessage[] = [
			{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
			{
				id: 'a1',
				role: 'assistant',
				parts: [{ type: 'text', text: 'Hello', state: undefined }],
				metadata: { model: 'm' }
			}
		];

		await saveMessages(supabase, CONVERSATION_ID, messages);

		expect(builder.upsert).toHaveBeenCalledWith(
			[
				{
					conversation_id: CONVERSATION_ID,
					id: 'u1',
					role: 'user',
					position: 0,
					parts: [{ type: 'text', text: 'Hi' }],
					metadata: null
				},
				{
					conversation_id: CONVERSATION_ID,
					id: 'a1',
					role: 'assistant',
					position: 1,
					parts: [{ type: 'text', text: 'Hello' }],
					metadata: { model: 'm' }
				}
			],
			{ onConflict: 'conversation_id,id' }
		);
	});

	it('does nothing for an empty thread', async () => {
		const { supabase, from } = supabaseMock({ data: null });
		await saveMessages(supabase, CONVERSATION_ID, []);
		expect(from).not.toHaveBeenCalled();
	});

	it('trims a thread from a message onward, and is a no-op for an unknown id', async () => {
		const found = supabaseMockSequence([{ data: { position: 3 } }, { data: null }]);
		await deleteMessagesFrom(found.supabase, CONVERSATION_ID, 'a2');
		expect(found.builder.delete).toHaveBeenCalled();
		expect(found.builder.gte).toHaveBeenCalledWith('position', 3);

		const missing = supabaseMockSequence([{ data: null }]);
		await deleteMessagesFrom(missing.supabase, CONVERSATION_ID, 'nope');
		expect(missing.builder.delete).not.toHaveBeenCalled();
	});

	it('renames within the org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CONVERSATION_ID, title: 'New' } });
		await updateConversationTitle(supabase, ORG_ID, CONVERSATION_ID, 'New');
		expect(builder.update).toHaveBeenCalledWith({ title: 'New' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', CONVERSATION_ID);
	});

	it('deletes with evidence, throwing when RLS filtered the row away', async () => {
		const deleted = supabaseMock({ data: [{ id: CONVERSATION_ID }] });
		await deleteConversation(deleted.supabase, ORG_ID, CONVERSATION_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteConversation(filtered.supabase, ORG_ID, CONVERSATION_ID)).rejects.toThrow(
			'Conversation was not deleted'
		);
	});
});
