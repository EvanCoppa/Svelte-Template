import type { Cookies } from '@sveltejs/kit';

/**
 * Active-organization cookie.
 *
 * Every signed-in session works inside exactly one organization at a time;
 * this cookie remembers which. It is a UI preference, not an auth boundary —
 * a stale or forged value is harmless because RLS returns zero rows for an
 * organization the user is not a member of, and the (app) layout load falls
 * back to the user's first organization whenever the cookie doesn't match a
 * real membership.
 */
export const ACTIVE_ORG_COOKIE = 'app-active-org';

/** A year: switching org is rare, the choice should survive normal sessions. */
export const ACTIVE_ORG_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the cookie's value only when it parses as a UUID, else null. */
export function readActiveOrg(cookies: Pick<Cookies, 'get'>): string | null {
	const value = cookies.get(ACTIVE_ORG_COOKIE);
	return value && UUID_PATTERN.test(value) ? value : null;
}

export function setActiveOrg(cookies: Pick<Cookies, 'set'>, orgId: string): void {
	cookies.set(ACTIVE_ORG_COOKIE, orgId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: ACTIVE_ORG_MAX_AGE
	});
}
