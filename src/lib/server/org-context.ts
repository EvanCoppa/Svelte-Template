import { error, type RequestEvent } from '@sveltejs/kit';
import { resolveFeatures } from '$lib/features/resolve';
import type { FeatureMap } from '$lib/features/types';
import { resolveActiveOrg, type OrgMembership } from '$lib/org';
import { setActiveOrg } from '$lib/server/active-org';
import { loadFeatureRegistry } from '$lib/server/features';
import { getUserAccess, type UserAccess } from '$lib/server/roles';

/**
 * Everything the app knows about the signed-in user's organizations for one
 * request, resolved once in `hooks.server.ts` and handed to the `(app)`
 * layout through `locals.org`. The hook needs it to gate the route; the
 * layout needs it to render the shell — resolving it in one place means one
 * membership query per request, and the active-org cookie is repaired
 * before any load runs rather than one request later.
 */
export type OrgContext = {
	organizations: OrgMembership[];
	activeOrg: OrgMembership;
	/** Every registered feature with its mode for the active org. */
	features: FeatureMap;
	/** The user's roles and grants in the active org. */
	access: UserAccess;
};

type Event = Pick<RequestEvent, 'locals' | 'cookies'>;

/**
 * Two parallel round trips (memberships with the active org's overrides and
 * opt-outs embedded, and the feature registry), then one more for a plain
 * member's grants. Owners and admins bypass grants entirely, so their access
 * is built without a query. Failures are a 500, never an empty context:
 * gating must fail closed, and a broken database should look broken.
 */
export async function loadOrgContext(event: Event): Promise<OrgContext> {
	const { supabase, user } = event.locals;
	if (!user) throw error(401, 'Not signed in.');

	// RLS scopes memberships to the signed-in user; the embeds pull each
	// org, its tier and its feature rows in the same round trip. The org
	// embed names its foreign key: member_roles, deals, tasks, tickets and
	// notifications all reference both tables, so a bare `organizations(...)`
	// is an ambiguous relationship to PostgREST (PGRST201).
	const [membershipsResult, registry] = await Promise.all([
		supabase
			.from('organization_members')
			.select(
				'role, organizations!organization_members_org_id_fkey(id, name, tier_id, industry_id, tiers(name), organization_feature_overrides(feature_id, mode), organization_disabled_features(feature_id))'
			)
			.eq('user_id', user.id),
		loadFeatureRegistry(supabase).catch((cause: unknown) => {
			console.error('[org-context] feature registry query failed', cause);
			throw error(500, 'Could not load the feature registry.');
		})
	]);
	if (membershipsResult.error) {
		throw error(500, 'Could not load your organizations.');
	}
	const memberships = membershipsResult.data;

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

	const activeOrg = resolveActiveOrg(organizations, event.locals.activeOrgId);
	// The signup trigger gives every user a personal org, so this only fires if
	// a fork removed that invariant without building its own onboarding.
	if (!activeOrg) {
		throw error(500, 'Your account has no organization.');
	}

	// Repair a missing or stale cookie, and the locals copy with it, so every
	// child load on THIS request agrees with what was resolved.
	if (event.locals.activeOrgId !== activeOrg.id) {
		setActiveOrg(event.cookies, activeOrg.id);
		event.locals.activeOrgId = activeOrg.id;
	}

	const activeRow = memberships.find((m) => m.organizations.id === activeOrg.id)?.organizations;
	const features = resolveFeatures(registry, {
		tierId: activeOrg.tierId,
		industryId: activeOrg.industryId,
		overrides: activeRow?.organization_feature_overrides ?? [],
		disabled: (activeRow?.organization_disabled_features ?? []).map((d) => d.feature_id)
	});

	const access: UserAccess =
		activeOrg.role === 'owner' || activeOrg.role === 'admin'
			? { role: activeOrg.role, roles: [], grants: new Map() }
			: await getUserAccess(supabase, activeOrg.id, user.id, activeOrg.role, activeOrg.industryId);

	return { organizations, activeOrg, features, access };
}
