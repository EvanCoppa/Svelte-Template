import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordListHref } from '$lib/crm/records';
import type { Database } from '$lib/database.types';
import { featureGateFor, passesFeatureGate } from '$lib/features/gate';
import { loadOrgContext } from '$lib/server/org-context';
import { requirePermission, hasGrant, type PermissionLevel } from '$lib/server/roles';

/**
 * What an `/api/documents/*` endpoint has to establish before it does
 * anything — the copy of `requireNoteAccess()` for pages, and for the same
 * reason: `/api/` is exempt from the hook's feature gate, so an endpoint asks
 * the gate's question itself.
 *
 * A browser gets sent somewhere it can act on the answer; an API caller only
 * needs the refusal.
 */

export const DOCUMENT_IMAGE_BUCKET = 'document-images';

export type DocumentContext = {
	supabase: SupabaseClient<Database>;
	orgId: string;
	/** Whether a kind's records may be opened at all — the gate, kind by kind. */
	canOpen: (kind: Parameters<typeof recordListHref>[0]) => boolean;
};

export async function requireDocumentAccess(
	event: RequestEvent,
	level: PermissionLevel
): Promise<DocumentContext> {
	const org = await loadOrgContext(event);

	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const gate = featureGateFor('/documents', org.features, canRead);
	if (gate) {
		throw 'status' in gate
			? error(gate.status, gate.message)
			: error(403, 'Pages are not available for this organization.');
	}

	requirePermission(org.access, 'documents', level);

	return {
		supabase: event.locals.supabase,
		orgId: org.activeOrg.id,
		canOpen: (kind) => passesFeatureGate(recordListHref(kind), org.features, canRead)
	};
}

/** What a page may hold a picture of. Matched against the real bytes' type. */
export const DOCUMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** 10 MB. A page is prose with pictures in it, not a photo library. */
export const DOCUMENT_IMAGE_LIMIT = 10 * 1024 * 1024;

const EXTENSIONS = new Map([
	['image/png', 'png'],
	['image/jpeg', 'jpg'],
	['image/gif', 'gif'],
	['image/webp', 'webp']
]);

export function imageExtension(type: string): string | null {
	return EXTENSIONS.get(type) ?? null;
}

/**
 * Where one org's picture lives in the bucket. The org id is the first
 * folder, which is what the storage policies check — so a forged path lands
 * in another org's folder and is refused by the database, not by this code.
 */
export function documentImagePath(orgId: string, name: string): string {
	return `${orgId}/${name}`;
}
