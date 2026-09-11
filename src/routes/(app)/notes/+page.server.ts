import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listNotes } from '$lib/server/crm/notes';
import { noteAccess } from '$lib/server/notes';
import type { PageServerLoad } from './$types';

/**
 * The shared scratchpad in one window — the screen `⌥⌘L` and the dock's
 * "open every note" lead to. The dock carries the open notes for the shell;
 * this load takes the archive as well, because searching is the reason to be
 * here and an archived note is exactly what you come looking for. What it
 * does NOT take is a note attached to a record: those are private to their
 * author and belong to that record's card.
 *
 * Gated by the hook on the `notes` feature + the read grant, like every other
 * list page; the page has no actions of its own, since a note is written
 * through `/api/notes` from whichever surface is showing it (see `$lib/notes`).
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	depends(QUERY.notes);

	// A record's own notes are private to whoever wrote them and live on that
	// record's card, not here — this screen is the shared scratchpad only, so
	// nothing it shows is about a record and none of it needs naming.
	const notes = await listNotes(supabase, activeOrgId, { attached: false });

	return { notes, access: noteAccess(org, user.id) };
};
