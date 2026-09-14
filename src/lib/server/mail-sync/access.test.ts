import { describe, expect, it } from 'vitest';
import type { FeatureMode } from '$lib/features/types';
import type { OrgRole } from '$lib/org';
import type { OrgContext } from '$lib/server/org-context';
import type { PermissionLevel } from '$lib/server/roles';
import { emailAccess } from './access';

function org(
	role: OrgRole,
	mode: FeatureMode | null,
	grants: [string, PermissionLevel][] = []
): OrgContext {
	const features: OrgContext['features'] = {};
	if (mode) {
		features.email = {
			mode,
			feature: {
				id: 'email',
				name: 'Emails',
				noun: 'email',
				description: null,
				route: '/email',
				icon: 'mail',
				category: 'crm',
				sort_order: 1150,
				created_at: '2026-01-01T00:00:00Z'
			}
		};
	}
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
		features,
		access: { role, roles: [], grants: new Map(grants) }
	};
}

describe('emailAccess', () => {
	it('gives an owner everything when the feature is on', () => {
		expect(emailAccess(org('owner', 'enabled'))).toEqual({
			mode: 'enabled',
			canRead: true,
			canManage: true,
			canDelete: true
		});
	});

	it('reads a member’s levels off their grants', () => {
		expect(emailAccess(org('member', 'enabled', [['email', 'manage']]))).toEqual({
			mode: 'enabled',
			canRead: true,
			canManage: true,
			canDelete: false
		});
		expect(emailAccess(org('member', 'enabled', [['email', 'read']])).canManage).toBe(false);
		expect(emailAccess(org('member', 'enabled')).canRead).toBe(false);
	});

	it('offers nothing while the plan locks the feature, and says so', () => {
		const access = emailAccess(org('owner', 'locked_visible'));
		expect(access).toEqual({
			mode: 'locked_visible',
			canRead: false,
			canManage: false,
			canDelete: false
		});
	});

	it('offers nothing when the org switched it off or the industry lacks it', () => {
		expect(emailAccess(org('owner', 'disabled')).canRead).toBe(false);
		expect(emailAccess(org('owner', 'hidden')).canRead).toBe(false);
		expect(emailAccess(org('owner', null))).toEqual({
			mode: null,
			canRead: true,
			canManage: true,
			canDelete: true
		});
	});
});
