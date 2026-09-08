import { error, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { RECORD_KINDS, recordHref, recordListHref, type RecordKind } from '$lib/crm/records';
import { featureGateFor, passesFeatureGate } from '$lib/features/gate';
import type { Vocabulary } from '$lib/features/vocabulary';
import type { NoteAccess } from '$lib/notes';
import type { UpdateNoteBody } from '$lib/schemas/notes';
import { loadOrgContext, type OrgContext } from './org-context';
import type { Note, NoteEdit } from './crm/notes';
import { getRecord, type CanOpen } from './crm/records';
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

/** Where a note points, named and linked — what a surface shows on the note. */
export type NoteLink = { label: string; href: string };

/**
 * The records the given notes are about, keyed by note id.
 *
 * A note is about a record through the same polymorphic link everything else
 * uses, so naming one is `getRecord()` — the app's one namer — rather than a
 * second table-to-name map that could disagree with the record page. Targets
 * are deduped, and a kind the reader may not open is not fetched at all (the
 * record page's rule): no link, and nothing leaked about a record they cannot
 * see. Notes pointing at nothing, which is most of them, cost no query.
 */
export async function noteLinks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	notes: readonly Note[],
	canOpen: CanOpen,
	vocabulary: Vocabulary
): Promise<Record<string, NoteLink>> {
	const targets = new Map<string, { kind: RecordKind; id: string }>();
	for (const note of notes) {
		const kind = RECORD_KINDS.find((candidate) => candidate === note.entity_type);
		// `proposal_option` is an entity type with no page of its own; a note on
		// one is legal in the database and simply unnamed here.
		if (!kind || !note.entity_id || !canOpen(kind)) continue;
		targets.set(`${kind}:${note.entity_id}`, { kind, id: note.entity_id });
	}
	if (targets.size === 0) return {};

	const found = new Map(
		(
			await Promise.all(
				[...targets].map(async ([key, { kind, id }]) => {
					const record = await getRecord(supabase, orgId, kind, id, canOpen, vocabulary);
					return record
						? ([key, { label: record.name, href: recordHref(kind, id) }] as const)
						: null;
				})
			)
		).filter((entry): entry is [string, NoteLink] => entry !== null)
	);

	return Object.fromEntries(
		notes.flatMap((note) => {
			const link = found.get(`${note.entity_type}:${note.entity_id}`);
			return link ? [[note.id, link] as const] : [];
		})
	);
}
