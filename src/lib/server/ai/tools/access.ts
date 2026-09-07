import type { FeatureId } from '$lib/features/types';
import type { OrgContext } from '$lib/server/org-context';
import { hasGrant, type PermissionLevel } from '$lib/server/roles';
import type { AssistantToolContext } from '../context';

/**
 * A tool is linked to the feature whose data it touches, at the level it
 * needs there — the same key and the same read < manage < delete ladder the
 * rest of the app is gated on. The assistant itself grants nothing: if the
 * feature is switched off for the org, or the caller lacks the level, the
 * tool does not exist for this request.
 */
export type ToolAccess = { feature: FeatureId; level: PermissionLevel };

/**
 * The intersection the hook enforces for pages, applied to one tool: the
 * feature's mode for the org must be `enabled` AND the caller must hold the
 * level. Drives `activeTools` on the agent, so the model never even sees a
 * tool it may not call.
 */
export function isToolActive(org: OrgContext, access: ToolAccess): boolean {
	return (
		org.features[access.feature]?.mode === 'enabled' &&
		hasGrant(org.access, access.feature, access.level)
	);
}

/**
 * Defence in depth behind `activeTools`, run first in every tool: a call the
 * model should not have been able to make (a stale one replayed from a
 * stored thread, a forged one) fails here as a tool error the model can read
 * and explain, before any data module runs.
 */
export function requireToolContext(
	context: AssistantToolContext,
	access: ToolAccess
): AssistantToolContext {
	if (!isToolActive(context.org, access)) {
		throw new Error(
			`This organization or your role does not allow "${access.level}" on ${access.feature}.`
		);
	}
	return context;
}
