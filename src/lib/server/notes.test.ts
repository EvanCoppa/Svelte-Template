import { describe, expect, it } from 'vitest';
import type { OrgRole } from '$lib/org';
import type { OrgContext } from './org-context';
import type { PermissionLevel } from './roles';
import { noteAccess, noteColumns } from './notes';

describe('noteColumns', () => {
	it('writes only what the browser sent, so one surface never clobbers another', () => {
		expect(noteColumns({ body: 'edited' })).toEqual({ body: 'edited' });
		expect(noteColumns({})).toEqual({});
	});

	it('clears a title rather than storing an empty one', () => {
		expect(noteColumns({ title: null })).toEqual({ title: null });
	});

	it('turns the API’s boolean into the column’s timestamp', () => {
		const before = Date.now();
		const archived = noteColumns({ archived: true });
		expect(Date.parse(archived.archived_at ?? '')).toBeGreaterThanOrEqual(before);
		expect(noteColumns({ archived: false })).toEqual({ archived_at: null });
	});
});

describe('noteAccess', () => {
	function org(role: OrgRole, grants: [string, PermissionLevel][] = []): OrgContext {
		return {
			organizations: [],
			activeOrg: {
				id: '10000000-0000-0000-0000-000000000001',
				name: 'Acme Inc',
				role,
				tierId: 'pro',
				tierName: 'Pro',
				industryId: 'crm'
			},
			features: {},
			access: { role, roles: [], grants: new Map(grants) }
		};
	}

	it('gives an owner both levels without a role assignment', () => {
		expect(noteAccess(org('owner'), 'u1')).toEqual({
			canManage: true,
			canDelete: true,
			viewer: { userId: 'u1', isOrgManager: true }
		});
	});

	it('reads a member’s level off their grants', () => {
		expect(noteAccess(org('member', [['notes', 'manage']]), 'u1')).toEqual({
			canManage: true,
			canDelete: false,
			viewer: { userId: 'u1', isOrgManager: false }
		});
	});

	it('leaves a member with no grant reading only', () => {
		const access = noteAccess(org('member'), 'u1');
		expect(access.canManage).toBe(false);
		expect(access.canDelete).toBe(false);
	});
});
