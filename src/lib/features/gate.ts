import type { FeatureMap, ResolvedFeature } from './types';

/**
 * Route gating — the pure matcher behind the server guard.
 *
 * `resolve.ts` decides what mode each feature is in for the session. This
 * file answers the next question: given a pathname, which feature governs
 * it, and does that feature's mode (plus the caller's read grant) let the
 * request through?
 *
 * Client-safe on purpose. `hooks.server.ts` enforces the decision; the nav
 * uses the same matcher, so nothing can advertise or navigate to a page the
 * server would bounce.
 */

/**
 * Pathname prefixes that are NEVER feature-gated: the surfaces a user needs
 * to respond to a gate decision (the upgrade page, the org's feature
 * settings), API endpoints (they carry their own checks) and sign-out.
 * Public paths never reach the gate — the auth guard handles them first.
 */
export const FEATURE_GATE_EXEMPT_PREFIXES = ['/settings', '/upgrade', '/api/', '/logout'] as const;

/** Where a request goes instead, or why it is refused. `null` = allowed. */
export type GateDecision = { redirectTo: string } | { status: 403 | 404; message: string };

/**
 * The feature that owns a pathname, or null when no feature claims it.
 * Longest route first so a nested feature wins over its parent; the home
 * route ('/') is matched exactly, never as a prefix.
 */
export function matchFeature(pathname: string, features: FeatureMap): ResolvedFeature | null {
	const ordered = Object.values(features).sort(
		(a, b) => b.feature.route.length - a.feature.route.length
	);
	for (const resolved of ordered) {
		const route = resolved.feature.route;
		if (route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)) {
			return resolved;
		}
	}
	return null;
}

/**
 * Decide a request. Mode first, then the read grant:
 *   locked_visible  -> /upgrade?feature=<id>
 *   disabled        -> /settings/features?feature=<id> (the org can undo it there)
 *   hidden          -> 404 (it does not exist for this org — never a 403 that
 *                      confirms the page is real)
 *   enabled, no read grant -> 403
 * Uncataloged and exempt paths are always allowed.
 */
export function featureGateFor(
	pathname: string,
	features: FeatureMap,
	canRead: (featureId: string) => boolean
): GateDecision | null {
	if (isExempt(pathname)) return null;

	const match = matchFeature(pathname, features);
	if (!match) return null;

	const id = encodeURIComponent(match.feature.id);
	switch (match.mode) {
		case 'locked_visible':
			return { redirectTo: `/upgrade?feature=${id}` };
		case 'disabled':
			return { redirectTo: `/settings/features?feature=${id}` };
		case 'hidden':
			return { status: 404, message: 'Not found.' };
		case 'enabled':
			return canRead(match.feature.id)
				? null
				: { status: 403, message: 'You do not have access to this page.' };
	}
}

/** Boolean form of `featureGateFor` — can this session open the path? */
export function passesFeatureGate(
	pathname: string,
	features: FeatureMap,
	canRead: (featureId: string) => boolean
): boolean {
	return featureGateFor(pathname, features, canRead) === null;
}

function isExempt(pathname: string): boolean {
	return FEATURE_GATE_EXEMPT_PREFIXES.some((prefix) =>
		prefix.endsWith('/')
			? pathname.startsWith(prefix)
			: pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}
