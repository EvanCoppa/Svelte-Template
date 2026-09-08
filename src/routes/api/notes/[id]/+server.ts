import { error, json } from '@sveltejs/kit';
import { updateNoteSchema } from '$lib/schemas/notes';
import { deleteNote, updateNote } from '$lib/server/crm/notes';
import { noteColumns, requireNoteAccess } from '$lib/server/notes';
import type { RequestHandler } from './$types';

/**
 * Edit and remove one note — the other half of `/api/notes`, and the reason
 * notes are a REST path rather than an action: the same note is written by
 * three verbs from surfaces that are not the page it lives on.
 *
 * Editing takes `manage`, removing takes `delete` (CLAUDE.md's ladder), and
 * RLS narrows both again to the note's author or an owner/admin.
 */
export const PATCH: RequestHandler = async (event) => {
	const { supabase, orgId } = await requireNoteAccess(event, 'manage');

	const parsed = updateNoteSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'That edit could not be saved.');
	}

	try {
		return json(await updateNote(supabase, orgId, event.params.id, noteColumns(parsed.data)));
	} catch (cause) {
		// `.single()` on a row RLS hid: the note is gone, or it is not this
		// caller's to change. Either way it is not a server fault.
		throw error(400, cause instanceof Error ? cause.message : 'That edit could not be saved.');
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { supabase, orgId } = await requireNoteAccess(event, 'delete');

	try {
		await deleteNote(supabase, orgId, event.params.id);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'That note could not be deleted.');
	}

	return new Response(null, { status: 204 });
};
