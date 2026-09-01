import { featureGateFor, type GateDecision } from '$lib/features/gate';
import { buildNav, type NavItem } from '$lib/navigation';
import type { OrgContext } from './org-context';
import { hasGrant } from './roles';

/**
 * "May this session open this route?" — answered in ONE place.
 *
 * Two axes decide it: the feature's mode for the active org (industry, tier,
 * operator overrides and the org's own opt-outs, folded by
 * `resolveFeatures()`) and the user's read grant on that feature
 * (`hasGrant()`). Both arrive on `locals.org`, so every function here takes
 * that context whole instead of asking callers to pass the pieces. The
 * moment two call sites each compose `features` and `access` for
 * themselves they drift, and a user sees a link that 403s.
 *
 *   routeGateFor    the hook — the full decision (redirect, refusal, allowed)
 *   canVisitRoute   app code — the boolean, for a load or action choosing a
 *                   redirect target
 *   navFor          the (app) layout — the entries this session may see
 *
 * The browser never receives the axes (grants stay on the server), so it
 * never asks this question directly: client code consumes the nav that
 * `navFor()` produced and looks pages up with `navItemFor()` from
 * `$lib/navigation`.
 */

/** Read grant on a feature id, curried the way the pure matchers expect. */
function canRead(org: OrgContext): (featureId: string) => boolean {
	return (featureId) => hasGrant(org.access, featureId);
}

/** Where a request goes instead, or why it is refused; null means allowed. */
export function routeGateFor(pathname: string, org: OrgContext): GateDecision | null {
	return featureGateFor(pathname, org.features, canRead(org));
}

/** May this session open `pathname`? The boolean form of `routeGateFor`. */
export function canVisitRoute(pathname: string, org: OrgContext): boolean {
	return routeGateFor(pathname, org) === null;
}

/** The sidebar and palette entries this session may see — filtered here, once. */
export function navFor(org: OrgContext): NavItem[] {
	return buildNav(org.features, canRead(org));
}
