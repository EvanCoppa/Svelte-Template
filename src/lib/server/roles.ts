import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { ensure, unwrap, unwrapDeleted } from './crm/unwrap';

/**
 * Roles & permissions: what a user may see and do inside the active org.
 *
 * Roles are org-scoped (two orgs can each have a "Support" role granting
 * different things), a member can hold several, and access is the UNION of
 * everything those roles grant — `manage` beats `read` wherever they overlap.
 * Org owners and admins implicitly hold `manage` on every permission, so a
 * fresh org (or this template before any roles exist) is never locked out.
 * The database mirrors the same rule in `private.permission_level()` for
 * policies that need it.
 *
 * Every function takes the request-scoped client (`locals.supabase`) and the
 * active org id (`locals.activeOrgId`) — the same contract as the crm
 * modules. RLS gates the writes (role management is owner/admin only), so
 * these helpers never re-check org_role themselves.
 *
 * Gating a page is two lines in its `+page.server.ts` load:
 *
 *   const access = await getUserAccess(supabase, orgId, userId, activeOrg.role);
 *   requirePermission(access, 'clients');            // hide the page: read
 *   requirePermission(access, 'clients', 'manage');  // add/edit/delete
 *
 * This is app-level gating in the tier-gating tradition: RLS remains the
 * security boundary, these decide what a screen offers. The permission keys
 * live in the `permissions` catalog table and grow by migration, usually one
 * per page.
 */

export type PermissionLevel = Enums<'permission_level'>;
export type Permission = Tables<'permissions'>;
export type Role = Tables<'roles'>;

/** One grant on a role, as edited by a role-management screen. */
export type PermissionGrant = Pick<Tables<'role_permissions'>, 'permission_id' | 'level'>;

/** A role with everything it grants, for role-management screens. */
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

type RoleColumn = 'name' | 'description';

/**
 * The one query pages need: the user's roles in the org and the unioned
 * grants they add up to. `role` comes from layout data (`activeOrg.role`) —
 * it is already loaded there, so this stays a single round trip.
 */
export async function getUserAccess(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	role: Enums<'org_role'>
): Promise<UserAccess> {
	const held = unwrap(
		await supabase
			.from('member_roles')
			.select('roles(id, name, role_permissions(permission_id, level))')
			.eq('org_id', orgId)
			.eq('user_id', userId)
	);

	const roles = held.map(({ roles: r }) => ({ id: r.id, name: r.name }));
	return { role, roles, grants: unionGrants(held.map(({ roles: r }) => r.role_permissions)) };
}

/** Folds grant lists from several roles into one map; `manage` wins. */
export function unionGrants(grantLists: PermissionGrant[][]): PermissionGrants {
	const grants = new Map<string, PermissionLevel>();
	for (const { permission_id, level } of grantLists.flat()) {
		if (grants.get(permission_id) !== 'manage') grants.set(permission_id, level);
	}
	return grants;
}

/**
 * Does this user reach `level` on `permission`? Owners and admins always do;
 * everyone else needs a role granting it (`manage` implies `read`).
 */
export function can(
	access: UserAccess,
	permission: string,
	level: PermissionLevel = 'read'
): boolean {
	if (access.role === 'owner' || access.role === 'admin') return true;
	const held = access.grants.get(permission);
	return held !== undefined && (level === 'read' || held === 'manage');
}

/** `can()` or a 403 — the guard a gated load or action opens with. */
export function requirePermission(
	access: UserAccess,
	permission: string,
	level: PermissionLevel = 'read'
): void {
	if (!can(access, permission, level)) {
		throw error(403, 'You do not have access to this page.');
	}
}

/** The full permission catalog, for role-management screens. */
export async function listPermissions(supabase: SupabaseClient<Database>): Promise<Permission[]> {
	return unwrap(await supabase.from('permissions').select('*').order('name'));
}

export async function listRoles(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<RoleWithPermissions[]> {
	return unwrap(
		await supabase
			.from('roles')
			.select('*, role_permissions(permission_id, level)')
			.eq('org_id', orgId)
			.order('name')
	);
}

export async function createRole(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'roles'>, RoleColumn>
): Promise<Role> {
	return unwrap(
		await supabase
			.from('roles')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateRole(
	supabase: SupabaseClient<Database>,
	orgId: string,
	roleId: string,
	values: Pick<TablesUpdate<'roles'>, RoleColumn>
): Promise<Role> {
	return unwrap(
		await supabase
			.from('roles')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', roleId)
			.select()
			.single()
	);
}

export async function deleteRole(
	supabase: SupabaseClient<Database>,
	orgId: string,
	roleId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('roles').delete().eq('org_id', orgId).eq('id', roleId).select('id'),
		'Role'
	);
}

/**
 * Replaces a role's grants wholesale — the shape a role-edit form submits.
 * Delete-then-insert keeps it a dumb, predictable save (removals included)
 * instead of a diff dance.
 */
export async function setRolePermissions(
	supabase: SupabaseClient<Database>,
	orgId: string,
	roleId: string,
	grants: PermissionGrant[]
): Promise<void> {
	ensure(
		await supabase.from('role_permissions').delete().eq('org_id', orgId).eq('role_id', roleId)
	);
	if (grants.length > 0) {
		ensure(
			await supabase
				.from('role_permissions')
				.insert(grants.map((grant) => ({ ...grant, org_id: orgId, role_id: roleId })))
		);
	}
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
