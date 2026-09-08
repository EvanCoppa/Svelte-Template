import { redirect } from '@sveltejs/kit';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listNotes } from '$lib/server/crm/notes';
import { noteAccess, noteLinks } from '$lib/server/notes';
import { hasGrant } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

/**
 * Every note in one window — the screen `⌥⌘L` and the dock's "open every
 * note" lead to. The dock carries the open notes for the shell; this load
 * takes the archive as well, because searching is the reason to be here and
 * an archived note is exactly what you come looking for.
 *
 * Gated by the hook on the `notes` feature + the read grant, like every other
 * list page; the page has no actions of its own, since a note is written
 * through `/api/notes` from whichever surface is showing it (see `$lib/notes`).
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	depends(QUERY.notes);

	// The same question the record page asks before it links to another kind.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const canOpen = (kind: RecordKind) =>
		passesFeatureGate(recordListHref(kind), org.features, canRead);

	const notes = await listNotes(supabase, activeOrgId);

	return {
		notes,
		links: await noteLinks(supabase, activeOrgId, notes, canOpen),
		access: noteAccess(org, user.id)
	};
};
