import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import {
	assignRole,
	can,
	getUserAccess,
	hasGrant,
	isSystemAdmin,
	listRoles,
	requirePermission,
	unassignRole,
	unionGrants,
	type PermissionLevel,
	type UserAccess
} from './roles';
import { ORG_ID, supabaseMock } from './crm/test-support';

const USER_ID = '00000000-0000-0000-0000-000000000002';
const ROLE_ID = 'b0000000-0000-0000-0000-000000000001';
const INDUSTRY_ID = 'general';

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
						{ feature_id: 'tickets', level: 'manage' },
						{ feature_id: 'companies', level: 'read' }
					]
				}
			},
			{
				roles: {
					id: 'b0000000-0000-0000-0000-000000000002',
					name: 'Sales',
					role_permissions: [
						{ feature_id: 'companies', level: 'manage' },
						{ feature_id: 'deals', level: 'read' }
					]
				}
			}
		];
		const { supabase, from, builder } = supabaseMock({ data: held });

		const access = await getUserAccess(supabase, ORG_ID, USER_ID, 'member', INDUSTRY_ID);
		expect(from).toHaveBeenCalledWith('member_roles');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(access.roles).toEqual([
			{ id: ROLE_ID, name: 'Support' },
			{ id: 'b0000000-0000-0000-0000-000000000002', name: 'Sales' }
		]);
		expect(access.grants).toEqual(
			new Map([
				['tickets', 'manage'],
				['companies', 'manage'],
				['deals', 'read']
			])
		);
	});

	it('filters roles to the org industry, mirroring private.feature_level', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await getUserAccess(supabase, ORG_ID, USER_ID, 'member', INDUSTRY_ID);
		expect(builder.select).toHaveBeenCalledWith(
			'roles!inner(id, name, role_permissions(feature_id, level))'
		);
		expect(builder.eq).toHaveBeenCalledWith('roles.industry_id', INDUSTRY_ID);
	});

	it('returns empty grants for a user holding no roles', async () => {
		const { supabase } = supabaseMock({ data: [] });

		const access = await getUserAccess(supabase, ORG_ID, USER_ID, 'member', INDUSTRY_ID);
		expect(access).toEqual({ role: 'member', roles: [], grants: new Map() });
	});
});

describe('isSystemAdmin', () => {
	it('is true when the caller has a system_admins row', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { user_id: USER_ID } });

		expect(await isSystemAdmin(supabase, USER_ID)).toBe(true);
		// One indexed lookup of the caller's own row — RLS shows nobody else's.
		expect(from).toHaveBeenCalledWith('system_admins');
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('is false for everyone else', async () => {
		const { supabase } = supabaseMock({ data: null });

		expect(await isSystemAdmin(supabase, USER_ID)).toBe(false);
	});

	it('throws when the lookup fails, so the org context fails closed', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(isSystemAdmin(supabase, USER_ID)).rejects.toThrow('boom');
	});
});

describe('unionGrants', () => {
	it('keeps manage over read regardless of order', () => {
		expect(
			unionGrants([
				[{ feature_id: 'companies', level: 'manage' }],
				[{ feature_id: 'companies', level: 'read' }]
			])
		).toEqual(new Map([['companies', 'manage']]));
		expect(
			unionGrants([
				[{ feature_id: 'companies', level: 'read' }],
				[{ feature_id: 'companies', level: 'manage' }]
			])
		).toEqual(new Map([['companies', 'manage']]));
	});

	it('keeps delete over manage regardless of order', () => {
		expect(
			unionGrants([
				[{ feature_id: 'staff', level: 'delete' }],
				[{ feature_id: 'staff', level: 'manage' }]
			])
		).toEqual(new Map([['staff', 'delete']]));
		expect(
			unionGrants([
				[{ feature_id: 'staff', level: 'manage' }],
				[{ feature_id: 'staff', level: 'delete' }]
			])
		).toEqual(new Map([['staff', 'delete']]));
	});
});

describe('can', () => {
	it('hides everything from a member with no grant', () => {
		expect(can(member([]), 'companies')).toBe(false);
		expect(can(member([]), 'companies', 'manage')).toBe(false);
	});

	it('read grants read but not manage; manage implies read', () => {
		const reader = member([['companies', 'read']]);
		expect(can(reader, 'companies')).toBe(true);
		expect(can(reader, 'companies', 'manage')).toBe(false);

		const manager = member([['companies', 'manage']]);
		expect(can(manager, 'companies')).toBe(true);
		expect(can(manager, 'companies', 'manage')).toBe(true);
	});

	it('delete is the top of the ladder and implies manage and read', () => {
		const manager = member([['staff', 'manage']]);
		expect(can(manager, 'staff', 'delete')).toBe(false);

		const remover = member([['staff', 'delete']]);
		expect(can(remover, 'staff')).toBe(true);
		expect(can(remover, 'staff', 'manage')).toBe(true);
		expect(can(remover, 'staff', 'delete')).toBe(true);
	});

	it('owners and admins bypass grants entirely, delete included', () => {
		for (const role of ['owner', 'admin'] as const) {
			const access: UserAccess = { role, roles: [], grants: new Map() };
			expect(can(access, 'companies', 'manage')).toBe(true);
			expect(can(access, 'staff', 'delete')).toBe(true);
		}
	});
});

describe('hasGrant', () => {
	it('checks any feature id, for ids that come from the registry', () => {
		expect(hasGrant(member([['companies', 'read']]), 'companies')).toBe(true);
		expect(hasGrant(member([['companies', 'read']]), 'not-a-feature')).toBe(false);
		expect(hasGrant({ role: 'admin', roles: [], grants: new Map() }, 'not-a-feature')).toBe(true);
	});
});

describe('requirePermission', () => {
	it('passes silently when access suffices', () => {
		expect(() => requirePermission(member([['companies', 'read']]), 'companies')).not.toThrow();
	});

	it('throws a 403 HttpError when it does not', () => {
		let thrown: unknown;
		try {
			requirePermission(member([]), 'companies');
		} catch (err) {
			thrown = err;
		}
		if (!isHttpError(thrown)) throw new Error('expected an HttpError');
		expect(thrown.status).toBe(403);
	});
});

describe('roles data access', () => {
	it('lists an industry catalog of roles with their grants', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listRoles(supabase, INDUSTRY_ID);
		expect(from).toHaveBeenCalledWith('roles');
		expect(builder.select).toHaveBeenCalledWith('*, role_permissions(feature_id, level)');
		expect(builder.eq).toHaveBeenCalledWith('industry_id', INDUSTRY_ID);
		expect(builder.order).toHaveBeenCalledWith('name');
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

		await expect(listRoles(supabase, INDUSTRY_ID)).rejects.toThrow('permission denied');
	});
});
