import { describe, expect, it } from 'vitest';
import { createNote, deleteNote, listNotes, updateNote } from './notes';
import { ORG_ID, supabaseMock } from './test-support';

const NOTE_ID = 'd0000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('notes data access', () => {
	it('lists the rail by position, newest first where nobody has moved one', async () => {
		const rows = [{ id: NOTE_ID, body: 'Ask about the second site' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listNotes(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('notes');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Where a note was dropped wins; behind that, creation rather than
		// `updated_at`, so a note must not climb the rail while it is typed into.
		expect(builder.order).toHaveBeenNthCalledWith(1, 'position', { ascending: false });
		expect(builder.order).toHaveBeenNthCalledWith(2, 'created_at', { ascending: false });
	});

	it('filters to the notes about one record', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotes(supabase, ORG_ID, {
			entity: { entityType: 'company', entityId: COMPANY_ID }
		});
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', COMPANY_ID);
	});

	it('splits the open notes from the archive, and asks for both by default', async () => {
		const open = supabaseMock({ data: [] });
		await listNotes(open.supabase, ORG_ID, { archived: false });
		expect(open.builder.is).toHaveBeenCalledWith('archived_at', null);

		const archived = supabaseMock({ data: [] });
		await listNotes(archived.supabase, ORG_ID, { archived: true });
		expect(archived.builder.not).toHaveBeenCalledWith('archived_at', 'is', null);

		const both = supabaseMock({ data: [] });
		await listNotes(both.supabase, ORG_ID);
		expect(both.builder.is).not.toHaveBeenCalled();
		expect(both.builder.not).not.toHaveBeenCalled();
	});

	it('restricts the rail to freestanding notes, never the ones attached to a record', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotes(supabase, ORG_ID, { attached: false });
		expect(builder.is).toHaveBeenCalledWith('entity_type', null);
	});

	it('caps the dock’s rail when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotes(supabase, ORG_ID, { limit: 40 });
		expect(builder.limit).toHaveBeenCalledWith(40);
	});

	it('writes a blank note about nothing — the dock’s + button', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTE_ID } });

		await createNote(supabase, ORG_ID);
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			entity_type: null,
			entity_id: null
		});
	});

	it('writes a note about a record', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTE_ID } });

		await createNote(
			supabase,
			ORG_ID,
			{ body: 'Procurement freeze lifts on the 14th', color: 'info' },
			{ entityType: 'company', entityId: COMPANY_ID }
		);
		expect(builder.insert).toHaveBeenCalledWith({
			body: 'Procurement freeze lifts on the 14th',
			color: 'info',
			org_id: ORG_ID,
			entity_type: 'company',
			entity_id: COMPANY_ID
		});
	});

	it('applies an edit inside the org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTE_ID } });

		await updateNote(supabase, ORG_ID, NOTE_ID, { body: 'edited', archived_at: null });
		expect(builder.update).toHaveBeenCalledWith({ body: 'edited', archived_at: null });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', NOTE_ID);
	});

	it('reports a refused edit rather than pretending it saved', async () => {
		const { supabase } = supabaseMock({ error: { message: 'no rows' } });

		await expect(updateNote(supabase, ORG_ID, NOTE_ID, { body: 'x' })).rejects.toThrow('no rows');
	});

	it('treats a delete that removed nothing as a refusal', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteNote(supabase, ORG_ID, NOTE_ID)).rejects.toThrow('Note was not deleted');
	});

	it('deletes a note the caller owns', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: NOTE_ID }] });

		await expect(deleteNote(supabase, ORG_ID, NOTE_ID)).resolves.toBeUndefined();
		expect(builder.delete).toHaveBeenCalled();
	});
});
