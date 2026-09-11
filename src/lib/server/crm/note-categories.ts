import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `note_categories` — the shelves `/notes` groups by.
 *
 * Same contract as every other module here: the request-scoped client plus the
 * active org id, RLS deciding what exists and who may write. A category is org
 * furniture rather than authored content (the migration says why), so any
 * member may add or rename one and only an owner or admin may delete it.
 *
 * Nothing in this module touches `notes`. Deleting a category unfiles its
 * notes through the foreign key's `on delete set null`, which is one statement
 * in the database instead of two round trips that could half-finish.
 */

export type NoteCategory = Tables<'note_categories'>;

type CategoryInsertColumn = 'name' | 'color' | 'position';
type CategoryUpdateColumn = CategoryInsertColumn;

/** An org's shelves, in the order the page shows them. */
export async function listNoteCategories(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<NoteCategory[]> {
	return unwrap(
		await supabase
			.from('note_categories')
			.select('*')
			.eq('org_id', orgId)
			.order('position', { ascending: true })
			.order('name', { ascending: true })
	);
}

/**
 * Adds a shelf at the end of the list. `position` defaults to the epoch of
 * now(), which sorts ascending to the bottom — a new heading appears where it
 * was added rather than jumping above the ones already there.
 */
export async function createNoteCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'note_categories'>, CategoryInsertColumn>
): Promise<NoteCategory> {
	return unwrap(
		await supabase
			.from('note_categories')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateNoteCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	categoryId: string,
	values: Pick<TablesUpdate<'note_categories'>, CategoryUpdateColumn>
): Promise<NoteCategory> {
	return unwrap(
		await supabase
			.from('note_categories')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', categoryId)
			.select()
			.single()
	);
}

/** Removes a shelf. Its notes are unfiled by the foreign key, never deleted. */
export async function deleteNoteCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	categoryId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('note_categories')
			.delete()
			.eq('org_id', orgId)
			.eq('id', categoryId)
			.select('id'),
		'Note category'
	);
}
