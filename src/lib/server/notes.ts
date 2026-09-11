import { error, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { recordListHref } from '$lib/crm/records';
import { featureGateFor, passesFeatureGate } from '$lib/features/gate';
import type { NoteAccess } from '$lib/notes';
import type { UpdateNoteBody } from '$lib/schemas/notes';
import { loadOrgContext, type OrgContext } from './org-context';
import type { NoteEdit } from './crm/notes';
import type { CanOpen } from './crm/records';
import { can, hasGrant, requirePermission, type PermissionLevel } from './roles';

/**
 * The server half of the notes API — the guard both `/api/notes` handlers
 * open with, and the one place a patch becomes columns.
 *
 * `hooks.server.ts` deliberately resolves no org context for `/api/*`: those
 * endpoints verify access themselves. A note write is an ordinary feature
 * write, so it asks exactly what a page load and a form action ask — the
 * feature's mode for the org, then the caller's grant — which costs this
 * endpoint the org-context round trip a page gets for free. That is the price
 * of the dock being able to save from any screen, and it buys one story about
 * who may write: never RLS alone.
 */

type Event = Pick<RequestEvent, 'locals' | 'cookies'>;

/** The request-scoped client, the org the caller is acting in, and what they may open. */
export type NoteContext = {
	supabase: SupabaseClient<Database>;
	orgId: string;
	/** Whether the caller may open a record of that kind — a note may only be written about one they can. */
	canOpen: CanOpen;
};

export async function requireNoteAccess(
	event: Event,
	level: PermissionLevel
): Promise<NoteContext> {
	const org = await loadOrgContext(event);

	// The same question `hooks.server.ts` asks of `/notes`, asked here because
	// `/api/` is exempt from the gate. A browser gets sent somewhere it can act
	// on the answer; an API caller only needs the refusal.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const gate = featureGateFor('/notes', org.features, canRead);
	if (gate) {
		throw 'status' in gate
			? error(gate.status, gate.message)
			: error(403, 'Notes are not available for this organization.');
	}

	requirePermission(org.access, 'notes', level);

	return {
		supabase: event.locals.supabase,
		orgId: org.activeOrg.id,
		canOpen: (kind) => passesFeatureGate(recordListHref(kind), org.features, canRead)
	};
}

/**
 * An edit as columns. Only the fields the browser actually sent are written,
 * so two surfaces editing different halves of a note never overwrite each
 * other's half with a stale copy — and `archived`, a boolean in the API, is
 * the timestamp the column keeps.
 */
export function noteColumns(patch: UpdateNoteBody): NoteEdit {
	const columns: NoteEdit = {};
	if (patch.title !== undefined) columns.title = patch.title;
	if (patch.body !== undefined) columns.body = patch.body;
	if (patch.color !== undefined) columns.color = patch.color;
	if (patch.archived !== undefined) {
		columns.archived_at = patch.archived ? new Date().toISOString() : null;
	}
	if (patch.categoryId !== undefined) columns.category_id = patch.categoryId;
	if (patch.position !== undefined) columns.position = patch.position;
	return columns;
}

/**
 * What this session may do with the notes a load is about to ship. One place,
 * because the shell, `/notes` and a record page all have to answer it the same
 * way — and the same way the policies do.
 */
export function noteAccess(org: OrgContext, userId: string): NoteAccess {
	return {
		canManage: can(org.access, 'notes', 'manage'),
		canDelete: can(org.access, 'notes', 'delete'),
		viewer: {
			userId,
			isOrgManager: org.activeOrg.role === 'owner' || org.activeOrg.role === 'admin'
		}
	};
}
