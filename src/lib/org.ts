import type { Database } from '$lib/database.types';

/**
 * Organization membership as the app consumes it: the org row flattened
 * together with the signed-in user's role in it and the org's tier. Built by
 * the (app) layout load; every page reads it from `page.data` rather than
 * querying membership again.
 */
export type OrgRole = Database['public']['Enums']['org_role'];

export type OrgMembership = {
	id: string;
	name: string;
	role: OrgRole;
	tierId: string;
	tierName: string;
};

/**
 * Picks the active organization: the one the cookie names if the user is
 * actually a member of it, otherwise the first membership. Returns null only
 * when the user has no organizations at all — which the signup trigger's
 * personal org makes impossible in practice, but the type stays honest.
 */
export function resolveActiveOrg(
	organizations: OrgMembership[],
	cookieValue: string | null
): OrgMembership | null {
	if (organizations.length === 0) return null;
	return organizations.find((org) => org.id === cookieValue) ?? organizations[0];
}
