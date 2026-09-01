import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `notes`. Same contract as clients.ts. `author_id` is
 * filled by the database (defaults to the caller) and RLS only lets authors
 * or owners/admins change or delete a note afterwards.
 */

export type Note = Tables<'notes'>;

export async function listNotes(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { clientId?: string } = {}
): Promise<Note[]> {
	let query = supabase
		.from('notes')
		.select('*')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.clientId) query = query.eq('client_id', filter.clientId);
	return unwrap(await query);
}

export async function createNote(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'notes'>, 'body' | 'client_id'>
): Promise<Note> {
	return unwrap(
		await supabase
			.from('notes')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateNote(
	supabase: SupabaseClient<Database>,
	orgId: string,
	noteId: string,
	values: Pick<TablesUpdate<'notes'>, 'body'>
): Promise<Note> {
	return unwrap(
		await supabase
			.from('notes')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', noteId)
			.select()
			.single()
	);
}

export async function deleteNote(
	supabase: SupabaseClient<Database>,
	orgId: string,
	noteId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('notes').delete().eq('org_id', orgId).eq('id', noteId).select('id'),
		'Note'
	);
}
