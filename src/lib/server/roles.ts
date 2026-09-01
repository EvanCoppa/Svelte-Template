import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import type { PermissionId } from '$lib/permissions';
import { ensure, unwrap, unwrapDeleted } from './crm/unwrap';

/**
 * Roles & permissions: what a user may see and do inside the active org.
 *
 * Roles are industry-scoped reference data — defined once per industry by
 * migration (like `tiers`), so onboarding a new org needs zero role setup:
 * the org's `industry_id` decides which roles its owners/admins can hand
 * out. Two industries can each have a "Support" role granting different
 * things. Custom per-org roles are a deliberate future extension, not built
 * yet. A member can hold several roles, and access is the UNION of
 * everything they grant — the strongest level wins wherever they overlap.
 * Levels form a ladder, `read` < `manage` < `delete`, each implying the ones
 * below it: `read` shows a page, `manage` allows add/edit, `delete` gates
 * destructive actions (the staff page's remove-member is the reference). Org
 * owners and admins implicitly hold `delete` on every permission, so a
 * fresh org is never locked out. The database mirrors the same rules in
 * `private.permission_level()` for policies that need it.
 *
 * Every function takes the request-scoped client (`locals.supabase`) plus
 * ids from layout data — the same contract as the crm modules. RLS gates
 * the writes (assigning roles is owner/admin only, and only from the org's
 * own industry), so these helpers never re-check org_role themselves.
 *
 * Gating a page is two lines in its `+page.server.ts` load:
 *
 *   const access = await getUserAccess(
 *     supabase, activeOrg.id, user.id, activeOrg.role, activeOrg.industryId
 *   );
 *   requirePermission(access, 'clients');            // hide the page: read
 *   requirePermission(access, 'clients', 'manage');  // add/edit/delete
 *
 * This is app-level gating in the tier-gating tradition: RLS remains the
 * security boundary, these decide what a screen offers. The permission keys
 * live in the `permissions` catalog table and grow by migration, usually
 * one per page.
 */

export type PermissionLevel = Enums<'permission_level'>;
export type Permission = Tables<'permissions'>;
export type Role = Tables<'roles'>;

// The key union lives in $lib/permissions (client code — the nav filter —
// needs it too); checks take it so a typo'd key is a `check` error — with a
// bare string it would silently pass for owners/admins (the bypass) while
// denying every member.
export type { PermissionId } from '$lib/permissions';

/** The ladder, low to high. Index = privilege; higher grants imply lower. */
const LEVEL_RANK = { read: 0, manage: 1, delete: 2 } satisfies Record<PermissionLevel, number>;

/** One grant on a role. */
export type PermissionGrant = Pick<Tables<'role_permissions'>, 'permission_id' | 'level'>;

/** A role with everything it grants, for role-assignment screens. */
export type RoleWithPermissions = Role & { role_permissions: PermissionGrant[] };

/** Union of a user's grants: permission key → strongest level held. */
export type PermissionGrants = ReadonlyMap<string, PermissionLevel>;

/** Everything access-related about one user in one org, in one shape. */
export type UserAccess = {
	/** The org-level role (owner/admin bypass permission checks entirely). */
	role: Enums<'org_role'>;
	/** The named roles this user holds in the org. */
	roles: Pick<Role, 'id' | 'name'>[];
	grants: PermissionGrants;
};

/**
 * The one query pages need: the user's roles in the org and the unioned
 * grants they add up to. `role` and `industryId` come from layout data
 * (`activeOrg`) — already loaded there, so this stays a single round trip.
 * Filtering to the org's current industry mirrors `private.permission_level`:
 * if an org's industry ever changes, assignments pointing at another
 * industry's roles go inert instead of still granting.
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
			.select('roles!inner(id, name, role_permissions(permission_id, level))')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.eq('roles.industry_id', industryId)
	);

	const roles = held.map(({ roles: r }) => ({ id: r.id, name: r.name }));
	return { role, roles, grants: unionGrants(held.map(({ roles: r }) => r.role_permissions)) };
}

/** Folds grant lists from several roles into one map; the strongest wins. */
export function unionGrants(grantLists: PermissionGrant[][]): PermissionGrants {
	const grants = new Map<string, PermissionLevel>();
	for (const { permission_id, level } of grantLists.flat()) {
		const held = grants.get(permission_id);
		if (held === undefined || LEVEL_RANK[level] > LEVEL_RANK[held]) {
			grants.set(permission_id, level);
		}
	}
	return grants;
}

/**
 * Does this user reach `level` on `permission`? Owners and admins always do;
 * everyone else needs a role granting it at that level or above.
 */
export function can(
	access: UserAccess,
	permission: PermissionId,
	level: PermissionLevel = 'read'
): boolean {
	if (access.role === 'owner' || access.role === 'admin') return true;
	const held = access.grants.get(permission);
	return held !== undefined && LEVEL_RANK[held] >= LEVEL_RANK[level];
}

/** `can()` or a 403 — the guard a gated load or action opens with. */
export function requirePermission(
	access: UserAccess,
	permission: PermissionId,
	level: PermissionLevel = 'read'
): void {
	if (!can(access, permission, level)) {
		throw error(403, 'You do not have access to this page.');
	}
}

/** The full permission catalog, for role-assignment screens. */
export async function listPermissions(supabase: SupabaseClient<Database>): Promise<Permission[]> {
	return unwrap(await supabase.from('permissions').select('*').order('name'));
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
			.select('*, role_permissions(permission_id, level)')
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
