import { error, type RequestEvent } from '@sveltejs/kit';
import { resolveFeatures } from '$lib/features/resolve';
import type { FeatureMap } from '$lib/features/types';
import { resolveActiveOrg, type OrgMembership } from '$lib/org';
import { setActiveOrg } from '$lib/server/active-org';
import { loadFeatureRegistry } from '$lib/server/features';
import { getUserAccess, isSystemAdmin, type UserAccess } from '$lib/server/roles';

/**
 * Everything the app knows about the signed-in user's organizations for one
 * request, resolved once in `hooks.server.ts` and handed to the `(app)`
 * layout through `locals.org`. The hook needs it to gate the route; the
 * layout needs it to render the shell — resolving it in one place means one
 * organizations query per request, and the active-org cookie is repaired
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
 * Three parallel round trips (the organizations RLS shows the user, with
 * their own membership row and each org's overrides and opt-outs embedded;
 * the feature registry; the operator flag), then one more for a plain
 * member's grants. Owners, admins and system admins bypass grants
 * entirely, so their access is built without a query. Failures are a 500,
 * never an empty context: gating must fail closed, and a broken database
 * should look broken.
 */
export async function loadOrgContext(event: Event): Promise<OrgContext> {
	const { supabase, user } = event.locals;
	if (!user) throw error(401, 'Not signed in.');

	// RLS scopes organizations to the ones the caller may act in — their
	// memberships, or every org for a system admin — and the embeds pull each
	// org's tier and feature rows in the same round trip. The members embed
	// is filtered to the caller's own row (co-members are visible too, and
	// not wanted here) and names its foreign key: member_roles, deals, tasks,
	// tickets and notifications all reference both tables, so a bare
	// `organization_members(...)` is an ambiguous relationship to PostgREST
	// (PGRST201). An operator's list is every org on the platform; past
	// PostgREST's max_rows (config.toml) the switcher would need a search
	// picker instead of this list — a scale this template does not model.
	const [orgsResult, registry, systemAdmin] = await Promise.all([
		supabase
			.from('organizations')
			.select(
				'id, name, tier_id, industry_id, tiers(name), organization_feature_overrides(feature_id, mode), organization_disabled_features(feature_id), organization_members!organization_members_org_id_fkey(role)'
			)
			.eq('organization_members.user_id', user.id),
		loadFeatureRegistry(supabase).catch((cause: unknown) => {
			console.error('[org-context] feature registry query failed', cause);
			throw error(500, 'Could not load the feature registry.');
		}),
		isSystemAdmin(supabase, user.id).catch((cause: unknown) => {
			console.error('[org-context] system admin lookup failed', cause);
			throw error(500, 'Could not load your access.');
		})
	]);
	if (orgsResult.error) {
		throw error(500, 'Could not load your organizations.');
	}
	const orgRows = orgsResult.data;

	// A system admin is owner of every org RLS showed them, whatever their own
	// membership says — the answer `private.org_role()` gives, so the screen
	// never offers less (or more) than the policies allow. Anyone else is
	// exactly the member RLS proved them to be: an org without a membership
	// row cannot reach a non-operator under the organizations policy, and is
	// dropped rather than handed a role it was never given.
	const organizations: OrgMembership[] = orgRows
		.flatMap((org) => {
			const role = systemAdmin ? 'owner' : org.organization_members[0]?.role;
			if (!role) return [];
			return [
				{
					id: org.id,
					name: org.name,
					role,
					tierId: org.tier_id,
					tierName: org.tiers.name,
					industryId: org.industry_id
				}
			];
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	// With no usable cookie, an operator lands in an org they belong to (the
	// personal-org invariant guarantees one), never in the first customer
	// alphabetically; for everyone else every entry is their own.
	const memberOf = new Set(
		orgRows.filter((org) => org.organization_members.length > 0).map((org) => org.id)
	);
	const activeOrg = resolveActiveOrg(organizations, event.locals.activeOrgId, (org) =>
		memberOf.has(org.id)
	);
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

	const activeRow = orgRows.find((org) => org.id === activeOrg.id);
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
