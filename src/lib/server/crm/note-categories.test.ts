import { describe, expect, it } from 'vitest';
import {
	createNoteCategory,
	deleteNoteCategory,
	listNoteCategories,
	updateNoteCategory
} from './note-categories';
import { ORG_ID, supabaseMock } from './test-support';

const CATEGORY_ID = 'e0000000-0000-0000-0000-000000000001';

describe('note category data access', () => {
	it('lists an org shelves in the order the page shows them', async () => {
		const rows = [{ id: CATEGORY_ID, name: 'Accounts' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listNoteCategories(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('note_categories');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Position first, name as the tie-break — a new shelf lands at the
		// bottom rather than jumping above the ones already there.
		expect(builder.order).toHaveBeenNthCalledWith(1, 'position', { ascending: true });
		expect(builder.order).toHaveBeenNthCalledWith(2, 'name', { ascending: true });
	});

	it('creates a category in the active org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CATEGORY_ID } });

		await createNoteCategory(supabase, ORG_ID, { name: 'Accounts', color: 'info' });
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Accounts',
			color: 'info',
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('scopes an edit to the org as well as the id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CATEGORY_ID } });

		await updateNoteCategory(supabase, ORG_ID, CATEGORY_ID, { name: 'Renamed', color: 'cyan' });
		expect(builder.update).toHaveBeenCalledWith({ name: 'Renamed', color: 'cyan' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', CATEGORY_ID);
	});

	it('reports a delete that matched nothing rather than succeeding silently', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteNoteCategory(supabase, ORG_ID, CATEGORY_ID)).rejects.toThrow(
			/Note category/
		);
	});

	it('deletes the row and nothing else — its notes are unfiled by the foreign key', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [{ id: CATEGORY_ID }] });

		await expect(deleteNoteCategory(supabase, ORG_ID, CATEGORY_ID)).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('note_categories');
		expect(builder.delete).toHaveBeenCalled();
	});
});
