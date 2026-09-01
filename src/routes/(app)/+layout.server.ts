import { error, redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import { resolveActiveOrg, type OrgMembership } from '$lib/org';
import { QUERY } from '$lib/queries';
import { setActiveOrg } from '$lib/server/active-org';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// The hook's authGuard already protects every non-public route; this
	// re-check is defense in depth so the (app) group stays private even if
	// someone edits PUBLIC_PATHS carelessly later.
	if (!locals.session || !locals.user) {
		throw redirect(303, '/login');
	}

	depends(QUERY.org);

	// RLS scopes this to the signed-in user's memberships; the joins pull the
	// org row and its tier in the same round trip. The embed names its foreign
	// key explicitly: deals, tasks, support_tickets, notifications and
	// member_roles all point at both tables, so PostgREST reads each of them as
	// a junction and a bare `organizations(...)` is an ambiguous relationship
	// (PGRST201). Any future table scoped to both an org and a member adds
	// another candidate path, so the hint has to stay.
	const { data: memberships, error: orgError } = await locals.supabase
		.from('organization_members')
		.select(
			'role, organizations!organization_members_org_id_fkey(id, name, tier_id, industry_id, tiers(name))'
		)
		.eq('user_id', locals.user.id);

	if (orgError) {
		// Surfacing the cause matters: every failure here renders the same vague
		// banner, so without this line a schema-level fault is indistinguishable
		// from an outage. The operator gets the detail, the browser does not.
		console.error('[(app)/layout] failed to load organizations', orgError);
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

	return {
		organizations,
		activeOrg,
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
