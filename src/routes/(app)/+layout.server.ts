import { error, redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import { resolveActiveOrg, type OrgMembership } from '$lib/org';
import type { PermissionId } from '$lib/permissions';
import { QUERY } from '$lib/queries';
import { setActiveOrg } from '$lib/server/active-org';
import { can, getUserAccess } from '$lib/server/roles';
import type { LayoutServerLoad } from './$types';

/**
 * The permissions the sidebar and ⌘K palette can gate a page on. Add a key
 * here when a nav item starts carrying it — anything not listed is never
 * asked about, so this stays one cheap resolution per navigation.
 */
const GATED_PERMISSIONS: PermissionId[] = ['staff'];

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// The hook's authGuard already protects every non-public route; this
	// re-check is defense in depth so the (app) group stays private even if
	// someone edits PUBLIC_PATHS carelessly later.
	if (!locals.session || !locals.user) {
		throw redirect(303, '/login');
	}

	depends(QUERY.org);

	// RLS scopes this to the signed-in user's memberships; the joins pull the
	// org row and its tier in the same round trip.
	const { data: memberships, error: orgError } = await locals.supabase
		.from('organization_members')
		.select('role, organizations(id, name, tier_id, industry_id, tiers(name))')
		.eq('user_id', locals.user.id);

	if (orgError) {
		throw error(500, 'Could not load your organizations.');
	}

	const organizations: OrgMembership[] = memberships
		.map(({ role, organizations: org }) => ({
			id: org.id,
			name: org.name,
			role,
			tierId: org.tier_id,
			tierName: org.tiers.name,
			industryId: org.industry_id
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const activeOrg = resolveActiveOrg(organizations, locals.activeOrgId);
	// The signup trigger gives every user a personal org, so this only fires if
	// a fork removed that invariant without building its own onboarding.
	if (!activeOrg) {
		throw error(500, 'Your account has no organization.');
	}

	// Repair a missing or stale cookie so child loads reading
	// `locals.activeOrgId` agree with what this layout resolved.
	if (locals.activeOrgId !== activeOrg.id) {
		setActiveOrg(cookies, activeOrg.id);
	}

	// The permission keys this user can READ in the active org — the one place
	// nav visibility is decided (see `visibleNavItems` in $lib/navigation).
	// Sending resolved keys rather than raw grants keeps `can()` and the
	// owner/admin bypass server-side, and keeps the payload tiny.
	const access = await getUserAccess(
		locals.supabase,
		activeOrg.id,
		locals.user.id,
		activeOrg.role,
		activeOrg.industryId
	);
	const permissions = GATED_PERMISSIONS.filter((permission) => can(access, permission));

	return {
		organizations,
		activeOrg,
		permissions,
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
