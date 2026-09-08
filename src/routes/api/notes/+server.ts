import { error, json } from '@sveltejs/kit';
import { createNoteSchema } from '$lib/schemas/notes';
import { createNote } from '$lib/server/crm/notes';
import { requireNoteAccess } from '$lib/server/notes';
import type { RequestHandler } from './$types';

/**
 * Write a note. A `+server.ts` endpoint rather than a form action because the
 * dock floats over every screen in the app — CLAUDE.md's cross-page-mutation
 * exception, the same one the team switcher takes — and because a note is
 * created blank and typed into, so there is no form to post. The editor on
 * `/notes` and the one on a record page use this too: one write path, not one
 * per surface.
 */
export const POST: RequestHandler = async (event) => {
	const { supabase, orgId, canOpen } = await requireNoteAccess(event, 'manage');

	const parsed = createNoteSchema.safeParse(await event.request.json().catch(() => ({})));
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'That note could not be saved.');
	}
	const { title, body, color, entityType, entityId } = parsed.data;

	// A note about a record the caller may not open would be a note they can
	// never see again — and asking whether the insert succeeds would say
	// whether that id exists. The gate answers first, as it does on a page.
	if (entityType && !canOpen(entityType)) {
		throw error(403, 'You cannot write a note about that record.');
	}

	try {
		// Undefined columns are dropped on the way out, so every one of them
		// falls back to the table's default — which is what makes the dock's +
		// button a bare POST with no body at all. The entity pair is checked
		// against the org by the database trigger, so a note can never be
		// written about another tenant's record.
		const note = await createNote(
			supabase,
			orgId,
			{ title, body, color },
			entityType && entityId ? { entityType, entityId } : undefined
		);
		return json(note, { status: 201 });
	} catch (cause) {
		// A refused insert is the caller's problem to fix (an unknown record,
		// a policy saying no), not a server fault — see crm/unwrap.ts.
		throw error(400, cause instanceof Error ? cause.message : 'That note could not be saved.');
	}
};
