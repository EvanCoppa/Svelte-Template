import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `notes` — the writing that stays open, and the table behind
 * the note dock and `/notes`.
 *
 * Same contract as activities.ts: the request-scoped client plus the active
 * org id, RLS deciding what exists, `author_id` filled by the database. The
 * one difference is the entity link, which IS updatable here: a note jotted
 * down loose gets attached to the record it turned out to be about, and the
 * notes migration explains why that is the note working rather than history
 * being rewritten.
 *
 * A note is a document, so nothing in this module merges or appends — an edit
 * replaces the columns it names, and the browser sends whole fields.
 */

export type Note = Tables<'notes'>;

type NoteInsertColumn = 'title' | 'body' | 'color';
type NoteUpdateColumn = NoteInsertColumn | 'archived_at' | 'position';

/**
 * What an edit may set. `archived_at` is the column behind the API's `archived`;
 * `position` is where the note sits on the rail (the notes_position migration).
 */
export type NoteEdit = Pick<TablesUpdate<'notes'>, NoteUpdateColumn>;

/**
 * How many notes the dock asks for. The rail draws one dash per note down the
 * edge of the viewport, so past a few dozen it is out of room regardless —
 * `/notes` is the screen that shows everything, which is what the shortcut is
 * for.
 */
export const DOCK_NOTE_LIMIT = 40;

export async function listNotes(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { entity?: CrmEntityRef; archived?: boolean; limit?: number } = {}
): Promise<Note[]> {
	let query = supabase
		.from('notes')
		.select('*')
		.eq('org_id', orgId)
		// The rail's order: `position` defaults to the moment a note was written,
		// so an untouched rail is newest first — by creation rather than by
		// edit, so a note never jumps up the rail while it is being typed into —
		// and a note somebody dragged sits where they dropped it.
		.order('position', { ascending: false })
		.order('created_at', { ascending: false });
	if (filter.entity) {
		query = query
			.eq('entity_type', filter.entity.entityType)
			.eq('entity_id', filter.entity.entityId);
	}
	// Unset means both; the page shows the archive behind a toggle.
	if (filter.archived === true) query = query.not('archived_at', 'is', null);
	if (filter.archived === false) query = query.is('archived_at', null);
	if (filter.limit) query = query.limit(filter.limit);
	return unwrap(await query);
}

/**
 * Writes a note, optionally about a record. Every column has a default, so
 * `createNote(supabase, orgId)` is the blank sticky the dock's + button makes
 * — created first, typed into after.
 */
export async function createNote(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'notes'>, NoteInsertColumn> = {},
	entity?: CrmEntityRef
): Promise<Note> {
	return unwrap(
		await supabase
			.from('notes')
			.insert({
				...values,
				org_id: orgId,
				entity_type: entity?.entityType ?? null,
				entity_id: entity?.entityId ?? null
			})
			.select()
			.single()
	);
}

/**
 * Applies an edit. RLS refuses a note the caller neither wrote nor manages,
 * and PostgREST reports that as zero rows — `.single()` turns it into the
 * thrown error every other module's refusals arrive as.
 */
export async function updateNote(
	supabase: SupabaseClient<Database>,
	orgId: string,
	noteId: string,
	values: NoteEdit
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
