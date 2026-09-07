import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import type { FeatureId } from '$lib/features/types';
import { ensure, unwrap, unwrapDeleted } from './crm/unwrap';

/**
 * Roles & grants: what a user may see and do inside the active org.
 *
 * Roles are industry-scoped reference data — defined once per industry by
 * migration (like `tiers`), so onboarding a new org needs zero role setup:
 * the org's `industry_id` decides which roles its owners/admins can hand
 * out. Two industries can each have a "Support" role granting different
 * things. Custom per-org roles are a deliberate future extension, not built
 * yet. A role grants `read` or `manage` on a FEATURE (the registry in
 * `src/lib/features/`), not on a page — one catalog drives navigation, the
 * route gate and grants. A member can hold several roles, and access is the
 * UNION of everything they grant — `manage` beats `read` wherever they
 * overlap. Org owners and admins implicitly hold `manage` on every feature,
 * so a fresh org is never locked out. The database mirrors the same rules
 * in `private.feature_level()` for policies that need it.
 *
 * System admins — platform operators, the `system_admins` table — sit
 * outside every industry's catalog: `private.org_role()` answers 'owner'
 * for them on every organization, member or not, so RLS lets them act
 * everywhere, and the org context mirrors that by giving them `role:
 * 'owner'` in every org (`isSystemAdmin()` below). Nothing else here
 * treats them specially — they take the owner/admin bypass.
 *
 * Every function takes the request-scoped client (`locals.supabase`) plus
 * ids from layout data — the same contract as the crm modules. RLS gates
 * the writes (assigning roles is owner/admin only, and only from the org's
 * own industry), so these helpers never re-check org_role themselves.
 *
 * Access is the intersection of two axes: the feature's mode for the org
 * (tier/industry/override, resolved in `src/lib/server/org-context.ts`) and
 * the caller's grant. `hooks.server.ts` enforces both for `read` on every
 * feature route, so a page load needs no check of its own. Writes still
 * gate themselves inside the action:
 *
 *   requirePermission(locals.org.access, 'clients', 'manage');
 */

export type PermissionLevel = Enums<'permission_level'>;
export type Role = Tables<'roles'>;

/** The ladder, low to high. Index = privilege; higher grants imply lower. */
const LEVEL_RANK = { read: 0, manage: 1, delete: 2 } satisfies Record<PermissionLevel, number>;

/** One grant on a role. */
export type PermissionGrant = Pick<Tables<'role_permissions'>, 'feature_id' | 'level'>;

/** A role with everything it grants, for role-assignment screens. */
export type RoleWithPermissions = Role & { role_permissions: PermissionGrant[] };

/** Union of a user's grants: feature id → strongest level held. */
export type PermissionGrants = ReadonlyMap<string, PermissionLevel>;

/** Everything access-related about one user in one org, in one shape. */
export type UserAccess = {
	/** The org-level role (owner/admin bypass grant checks entirely). */
	role: Enums<'org_role'>;
	/** The named roles this user holds in the org. */
	roles: Pick<Role, 'id' | 'name'>[];
	grants: PermissionGrants;
};

/**
 * The one query pages need: the user's roles in the org and the unioned
 * grants they add up to. `role` and `industryId` come from the org context
 * — already loaded there, so this stays a single round trip. Filtering to
 * the org's current industry mirrors `private.feature_level`: if an org's
 * industry ever changes, assignments pointing at another industry's roles
 * go inert instead of still granting.
 */
export async function getUserAccess(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	role: Enums<'org_role'>,
	industryId: string
): Promise<UserAccess> {
	const held = unwrap(
		await supabase
			.from('member_roles')
			.select('roles!inner(id, name, role_permissions(feature_id, level))')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.eq('roles.industry_id', industryId)
	);

	const roles = held.map(({ roles: r }) => ({ id: r.id, name: r.name }));
	return { role, roles, grants: unionGrants(held.map(({ roles: r }) => r.role_permissions)) };
}

/**
 * Is this user a platform operator? A user can only ever read their own
 * `system_admins` row, so this is one indexed lookup, never a listing —
 * and the answer is exactly what `private.is_system_admin()` gives the
 * policies. Operators are added and removed by SQL / the service role only
 * (see the system_admins migration); there is no write path here on
 * purpose.
 */
export async function isSystemAdmin(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<boolean> {
	const row = unwrap(
		await supabase.from('system_admins').select('user_id').eq('user_id', userId).maybeSingle()
	);
	return row !== null;
}

/** Folds grant lists from several roles into one map; the strongest wins. */
export function unionGrants(grantLists: PermissionGrant[][]): PermissionGrants {
	const grants = new Map<string, PermissionLevel>();
	for (const { feature_id, level } of grantLists.flat()) {
		const held = grants.get(feature_id);
		if (held === undefined || LEVEL_RANK[level] > LEVEL_RANK[held]) {
			grants.set(feature_id, level);
		}
	}
	return grants;
}

/**
 * Does this user reach `level` on a feature? Owners and admins always do;
 * everyone else needs a role granting it at that level or above. Takes any
 * string because the gate and the nav check ids that come from the registry
 * rows; app code should call `can()` for a typed key.
 */
export function hasGrant(
	access: UserAccess,
	featureId: string,
	level: PermissionLevel = 'read'
): boolean {
	if (access.role === 'owner' || access.role === 'admin') return true;
	const held = access.grants.get(featureId);
	return held !== undefined && LEVEL_RANK[held] >= LEVEL_RANK[level];
}

/** `hasGrant()` for a key the app knows at build time — typos are `check` errors. */
export function can(
	access: UserAccess,
	feature: FeatureId,
	level: PermissionLevel = 'read'
): boolean {
	return hasGrant(access, feature, level);
}

/** `can()` or a 403 — the guard a write action opens with. */
export function requirePermission(
	access: UserAccess,
	feature: FeatureId,
	level: PermissionLevel = 'read'
): void {
	if (!can(access, feature, level)) {
		throw error(403, 'You do not have access to this page.');
	}
}

/**
 * The roles an org can hand out — its industry's catalog, with what each
 * grants. Reference data; defining or editing roles is a migration, not UI.
 */
export async function listRoles(
	supabase: SupabaseClient<Database>,
	industryId: string
): Promise<RoleWithPermissions[]> {
	return unwrap(
		await supabase
			.from('roles')
			.select('*, role_permissions(feature_id, level)')
			.eq('industry_id', industryId)
			.order('name')
	);
}

export async function assignRole(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	roleId: string
): Promise<void> {
	ensure(
		await supabase.from('member_roles').insert({ org_id: orgId, user_id: userId, role_id: roleId })
	);
}

export async function unassignRole(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	roleId: string
): Promise<void> {
	// member_roles has no surrogate id; aliasing keeps unwrapDeleted's
	// zero-rows-means-refused contract without a second shape.
	unwrapDeleted(
		await supabase
			.from('member_roles')
			.delete()
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.eq('role_id', roleId)
			.select('id:role_id'),
		'Role assignment'
	);
}
