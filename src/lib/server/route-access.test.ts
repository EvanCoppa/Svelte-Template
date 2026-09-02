import { describe, expect, it } from 'vitest';
import { ORG_ID } from './crm/test-support';
import type { OrgContext } from './org-context';
import type { UserAccess } from './roles';
import { canVisitRoute, navFor, routeGateFor } from './route-access';

const feature = (id: string) => ({
	id,
	name: id,
	description: null,
	route: `/${id}`,
	icon: null,
	category: 'platform',
	sort_order: 0,
	created_at: ''
});

/** One org showing every mode, seen through the given user's access. */
function context(access: UserAccess): OrgContext {
	return {
		organizations: [],
		activeOrg: {
			id: ORG_ID,
			name: 'Acme Inc',
			role: access.role,
			tierId: 'pro',
			tierName: 'Pro',
			industryId: 'general'
		},
		features: {
			clients: { feature: feature('clients'), mode: 'enabled' },
			deals: { feature: feature('deals'), mode: 'enabled' },
			tasks: { feature: feature('tasks'), mode: 'disabled' },
			'best-practices': { feature: feature('best-practices'), mode: 'locked_visible' },
			secret: { feature: feature('secret'), mode: 'hidden' }
		},
		access
	};
}

const owner = context({ role: 'owner', roles: [], grants: new Map() });
// A plain member whose one role grants read on clients and nothing else.
const support = context({
	role: 'member',
	roles: [{ id: 'r1', name: 'Support' }],
	grants: new Map([['clients', 'read']])
});

describe('canVisitRoute', () => {
	it('intersects the feature mode with the read grant', () => {
		expect(canVisitRoute('/clients', owner)).toBe(true);
		expect(canVisitRoute('/clients/42', support)).toBe(true);
		// Deals is enabled for the org, but Support holds no grant on it.
		expect(canVisitRoute('/deals', owner)).toBe(true);
		expect(canVisitRoute('/deals', support)).toBe(false);
	});

	it('refuses locked, disabled and hidden features for everyone', () => {
		for (const org of [owner, support]) {
			expect(canVisitRoute('/best-practices', org)).toBe(false);
			expect(canVisitRoute('/tasks', org)).toBe(false);
			expect(canVisitRoute('/secret', org)).toBe(false);
		}
	});

	it('always allows the exempt surfaces and uncataloged paths', () => {
		expect(canVisitRoute('/', support)).toBe(true);
		expect(canVisitRoute('/settings/features', support)).toBe(true);
		expect(canVisitRoute('/upgrade', support)).toBe(true);
	});
});

describe('routeGateFor', () => {
	it('carries the decision that canVisitRoute collapses to a boolean', () => {
		expect(routeGateFor('/clients', support)).toBeNull();
		expect(routeGateFor('/deals', support)).toEqual({
			status: 403,
			message: 'You do not have access to this page.'
		});
		expect(routeGateFor('/best-practices', owner)).toEqual({
			redirectTo: '/upgrade?feature=best-practices'
		});
		expect(routeGateFor('/tasks', owner)).toEqual({
			redirectTo: '/settings/features?feature=tasks'
		});
		expect(routeGateFor('/secret', owner)).toEqual({ status: 404, message: 'Not found.' });
	});
});

describe('navFor', () => {
	const featureIds = (org: OrgContext) =>
		navFor(org)
			.filter((item) => item.featureId)
			.map((item) => item.featureId);

	it('lists the readable features that are enabled or locked, nothing else', () => {
		expect(featureIds(owner)).toEqual(['best-practices', 'clients', 'deals']);
		expect(featureIds(support)).toEqual(['clients']);
	});

	it('agrees with the gate on every entry it lists', () => {
		for (const org of [owner, support]) {
			for (const item of navFor(org)) {
				// An unlocked entry opens; a locked one is exactly what the gate
				// would redirect to the upgrade page.
				expect(canVisitRoute(item.href, org)).toBe(!item.locked);
			}
		}
	});
});
