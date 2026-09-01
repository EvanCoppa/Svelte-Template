import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import {
	assignRole,
	can,
	createRole,
	deleteRole,
	getUserAccess,
	listPermissions,
	listRoles,
	requirePermission,
	setRolePermissions,
	unassignRole,
	unionGrants,
	updateRole,
	type PermissionLevel,
	type UserAccess
} from './roles';
import { ORG_ID, supabaseMock } from './crm/test-support';

const USER_ID = '00000000-0000-0000-0000-000000000002';
const ROLE_ID = 'a0000000-0000-0000-0000-000000000001';

const member = (grants: [string, PermissionLevel][]): UserAccess => ({
	role: 'member',
	roles: [{ id: ROLE_ID, name: 'Support' }],
	grants: new Map(grants)
});

describe('getUserAccess', () => {
	it('unions grants across every role the user holds, manage winning', async () => {
		const held = [
			{
				roles: {
					id: ROLE_ID,
					name: 'Support',
					role_permissions: [
						{ permission_id: 'tickets', level: 'manage' },
						{ permission_id: 'clients', level: 'read' }
					]
				}
			},
			{
				roles: {
					id: 'a0000000-0000-0000-0000-000000000002',
					name: 'Sales',
					role_permissions: [
						{ permission_id: 'clients', level: 'manage' },
						{ permission_id: 'deals', level: 'read' }
					]
				}
			}
		];
		const { supabase, from, builder } = supabaseMock({ data: held });

		const access = await getUserAccess(supabase, ORG_ID, USER_ID, 'member');
		expect(from).toHaveBeenCalledWith('member_roles');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(access.roles).toEqual([
			{ id: ROLE_ID, name: 'Support' },
			{ id: 'a0000000-0000-0000-0000-000000000002', name: 'Sales' }
		]);
		expect(access.grants).toEqual(
			new Map([
				['tickets', 'manage'],
				['clients', 'manage'],
				['deals', 'read']
			])
		);
	});

	it('returns empty grants for a user holding no roles', async () => {
		const { supabase } = supabaseMock({ data: [] });

		const access = await getUserAccess(supabase, ORG_ID, USER_ID, 'member');
		expect(access).toEqual({ role: 'member', roles: [], grants: new Map() });
	});
});

describe('unionGrants', () => {
	it('keeps manage over read regardless of order', () => {
		expect(
			unionGrants([
				[{ permission_id: 'clients', level: 'manage' }],
				[{ permission_id: 'clients', level: 'read' }]
			])
		).toEqual(new Map([['clients', 'manage']]));
		expect(
			unionGrants([
				[{ permission_id: 'clients', level: 'read' }],
				[{ permission_id: 'clients', level: 'manage' }]
			])
		).toEqual(new Map([['clients', 'manage']]));
	});
});

describe('can', () => {
	it('hides everything from a member with no grant', () => {
		expect(can(member([]), 'clients')).toBe(false);
		expect(can(member([]), 'clients', 'manage')).toBe(false);
	});

	it('read grants read but not manage; manage implies read', () => {
		const reader = member([['clients', 'read']]);
		expect(can(reader, 'clients')).toBe(true);
		expect(can(reader, 'clients', 'manage')).toBe(false);

		const manager = member([['clients', 'manage']]);
		expect(can(manager, 'clients')).toBe(true);
		expect(can(manager, 'clients', 'manage')).toBe(true);
	});

	it('owners and admins bypass grants entirely', () => {
		for (const role of ['owner', 'admin'] as const) {
			const access: UserAccess = { role, roles: [], grants: new Map() };
			expect(can(access, 'anything', 'manage')).toBe(true);
		}
	});
});

describe('requirePermission', () => {
	it('passes silently when access suffices', () => {
		expect(() => requirePermission(member([['clients', 'read']]), 'clients')).not.toThrow();
	});

	it('throws a 403 HttpError when it does not', () => {
		let thrown: unknown;
		try {
			requirePermission(member([]), 'clients');
		} catch (err) {
			thrown = err;
		}
		if (!isHttpError(thrown)) throw new Error('expected an HttpError');
		expect(thrown.status).toBe(403);
	});
});

describe('roles data access', () => {
	it('lists the permission catalog ordered by name', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listPermissions(supabase);
		expect(from).toHaveBeenCalledWith('permissions');
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('lists roles with their grants, scoped to the org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listRoles(supabase, ORG_ID);
		expect(from).toHaveBeenCalledWith('roles');
		expect(builder.select).toHaveBeenCalledWith('*, role_permissions(permission_id, level)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('creates a role under the given org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ROLE_ID } });

		await createRole(supabase, ORG_ID, { name: 'Support', description: 'Works tickets' });
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Support',
			description: 'Works tickets',
			org_id: ORG_ID
		});
	});

	it('scopes updates to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ROLE_ID } });

		await updateRole(supabase, ORG_ID, ROLE_ID, { name: 'Helpdesk' });
		expect(builder.update).toHaveBeenCalledWith({ name: 'Helpdesk' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', ROLE_ID);
	});

	it('throws when a delete matches no rows (RLS filtered it)', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteRole(supabase, ORG_ID, ROLE_ID)).rejects.toThrow('Role was not deleted');
	});

	it('replaces grants wholesale: delete then insert', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await setRolePermissions(supabase, ORG_ID, ROLE_ID, [
			{ permission_id: 'tickets', level: 'manage' }
		]);
		expect(from).toHaveBeenCalledWith('role_permissions');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.insert).toHaveBeenCalledWith([
			{ permission_id: 'tickets', level: 'manage', org_id: ORG_ID, role_id: ROLE_ID }
		]);
	});

	it('clearing every grant skips the insert', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await setRolePermissions(supabase, ORG_ID, ROLE_ID, []);
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('assigns a role to a member of the org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await assignRole(supabase, ORG_ID, USER_ID, ROLE_ID);
		expect(from).toHaveBeenCalledWith('member_roles');
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			user_id: USER_ID,
			role_id: ROLE_ID
		});
	});

	it('unassigns with evidence, throwing when nothing matched', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: ROLE_ID }] });

		await unassignRole(supabase, ORG_ID, USER_ID, ROLE_ID);
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(builder.eq).toHaveBeenCalledWith('role_id', ROLE_ID);

		const empty = supabaseMock({ data: [] });
		await expect(unassignRole(empty.supabase, ORG_ID, USER_ID, ROLE_ID)).rejects.toThrow(
			'Role assignment was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(listRoles(supabase, ORG_ID)).rejects.toThrow('permission denied');
	});
});
