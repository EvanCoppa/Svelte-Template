import type { Database } from '$lib/database.types';

/**
 * Organization membership as the app consumes it: the org row flattened
 * together with the signed-in user's role in it and the org's tier. Built
 * once per request by `loadOrgContext()`; every page reads it from
 * `page.data` rather than querying membership again. A system admin gets
 * one of these for every org, with role `owner` — the answer the database
 * gives them too.
 */
export type OrgRole = Database['public']['Enums']['org_role'];

export type OrgMembership = {
	id: string;
	name: string;
	role: OrgRole;
	tierId: string;
	tierName: string;
	/** Decides which industry's roles the org can hand out (see roles.ts). */
	industryId: string;
};

/**
 * Picks the active organization: the one the cookie names if the user may
 * act in it, otherwise the first organization they actually belong to. For
 * a system admin the list holds every org on the platform, and a missing or
 * stale cookie should land them in their own workspace, not in whichever
 * customer sorts first — `isOwn` says which entries are the user's real
 * memberships; when omitted, every entry is. Returns null only when the
 * user has no organizations at all — which the signup trigger's personal
 * org makes impossible in practice, but the type stays honest.
 */
export function resolveActiveOrg(
	organizations: OrgMembership[],
	cookieValue: string | null,
	isOwn: (org: OrgMembership) => boolean = () => true
): OrgMembership | null {
	if (organizations.length === 0) return null;
	return (
		organizations.find((org) => org.id === cookieValue) ??
		organizations.find(isOwn) ??
		organizations[0]
	);
}
