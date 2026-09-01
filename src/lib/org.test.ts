import { describe, expect, it } from 'vitest';
import { resolveActiveOrg, type OrgMembership } from './org';

function org(id: string, name: string, overrides: Partial<OrgMembership> = {}): OrgMembership {
	return { id, name, role: 'member', tierId: 'free', tierName: 'Free', ...overrides };
}

const acme = org('10000000-0000-0000-0000-000000000001', 'Acme Inc', {
	role: 'owner',
	tierId: 'pro',
	tierName: 'Pro'
});
const globex = org('10000000-0000-0000-0000-000000000002', 'Globex');

describe('resolveActiveOrg', () => {
	it('returns the organization the cookie names when the user is a member', () => {
		expect(resolveActiveOrg([acme, globex], globex.id)).toBe(globex);
	});

	it('falls back to the first organization when the cookie is stale', () => {
		expect(resolveActiveOrg([acme, globex], '99999999-0000-0000-0000-000000000000')).toBe(acme);
	});

	it('falls back to the first organization when there is no cookie', () => {
		expect(resolveActiveOrg([acme, globex], null)).toBe(acme);
	});

	it('returns null for a user with no organizations', () => {
		expect(resolveActiveOrg([], acme.id)).toBeNull();
	});
});
