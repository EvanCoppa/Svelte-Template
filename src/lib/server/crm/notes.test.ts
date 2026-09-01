import { describe, expect, it } from 'vitest';
import { createNote, deleteNote, listNotes, updateNote } from './notes';
import { ORG_ID, supabaseMock } from './test-support';

const NOTE_ID = '60000000-0000-0000-0000-000000000001';
const CLIENT_ID = '20000000-0000-0000-0000-000000000001';

describe('notes data access', () => {
	it('lists org notes newest first, without a client filter by default', async () => {
		const rows = [{ id: NOTE_ID, body: 'Prefers email.' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listNotes(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('notes');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).not.toHaveBeenCalledWith('client_id', expect.anything());
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('filters to one client when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotes(supabase, ORG_ID, { clientId: CLIENT_ID });
		expect(builder.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
	});

	it('creates a note under the org without touching author_id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTE_ID } });

		await createNote(supabase, ORG_ID, { body: 'Call back Monday.', client_id: CLIENT_ID });
		expect(builder.insert).toHaveBeenCalledWith({
			body: 'Call back Monday.',
			client_id: CLIENT_ID,
			org_id: ORG_ID
		});
	});

	it('updates and deletes scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTE_ID } });

		await updateNote(supabase, ORG_ID, NOTE_ID, { body: 'Edited.' });
		expect(builder.update).toHaveBeenCalledWith({ body: 'Edited.' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', NOTE_ID);

		await deleteNote(supabase, ORG_ID, NOTE_ID);
		expect(builder.delete).toHaveBeenCalled();
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'not allowed' } });

		await expect(createNote(supabase, ORG_ID, { body: 'x' })).rejects.toThrow('not allowed');
	});
});
