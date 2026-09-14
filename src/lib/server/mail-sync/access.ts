import { error, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { featureGateFor } from '$lib/features/gate';
import type { FeatureMode } from '$lib/features/types';
import { loadOrgContext, type OrgContext } from '$lib/server/org-context';
import { can, hasGrant, requirePermission, type PermissionLevel } from '$lib/server/roles';

/**
 * What a session may do with email — the one answer for the settings page,
 * the record page's tab and the `/api/integrations/google/*` endpoints.
 *
 * `/email` itself is gated by the hook like any feature route. The other
 * surfaces are not: `/settings/integrations` is a settings page (exempt, so
 * it exists for every org — but it must OFFER a connection only where the
 * feature is enabled and the caller may manage it), and the OAuth endpoints
 * are `/api/*` (exempt, so they ask here, the way `/api/notes` asks
 * `requireNoteAccess`).
 */

export const EMAIL_FEATURE = 'email';
export const EMAIL_ROUTE = '/email';

export type EmailAccess = {
	/** The feature's mode for the org, or null when it is not registered. */
	mode: FeatureMode | null;
	/** Enabled for the org and readable by the caller — the gate's own answer for /email. */
	canRead: boolean;
	canManage: boolean;
	canDelete: boolean;
};

export function emailAccess(org: OrgContext): EmailAccess {
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const enabled = featureGateFor(EMAIL_ROUTE, org.features, canRead) === null;
	return {
		mode: org.features[EMAIL_FEATURE]?.mode ?? null,
		canRead: enabled,
		canManage: enabled && can(org.access, EMAIL_FEATURE, 'manage'),
		canDelete: enabled && can(org.access, EMAIL_FEATURE, 'delete')
	};
}

export type EmailContext = {
	supabase: SupabaseClient<Database>;
	orgId: string;
	userId: string;
	org: OrgContext;
};

/**
 * For the API endpoints: the org the caller is acting in, refused the way
 * the gate would refuse `/email` (404 when hidden, 403 otherwise) and then
 * checked for the level the act needs.
 */
export async function requireEmailAccess(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	level: PermissionLevel
): Promise<EmailContext> {
	const org = await loadOrgContext(event);
	const user = event.locals.user;
	if (!user) throw error(401, 'Not signed in.');

	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const gate = featureGateFor(EMAIL_ROUTE, org.features, canRead);
	if (gate) {
		throw 'status' in gate
			? error(gate.status, gate.message)
			: error(403, 'Email sync is not available for this organization.');
	}
	requirePermission(org.access, EMAIL_FEATURE, level);

	return { supabase: event.locals.supabase, orgId: org.activeOrg.id, userId: user.id, org };
}
