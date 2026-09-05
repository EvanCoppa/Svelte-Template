import { describe, expect, it } from 'vitest';
import { resolveActiveOrg, type OrgMembership } from './org';

function org(id: string, name: string, overrides: Partial<OrgMembership> = {}): OrgMembership {
	return {
		id,
		name,
		role: 'member',
		tierId: 'free',
		tierName: 'Free',
		industryId: 'general',
		...overrides
	};
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

	it('prefers an organization the user belongs to over one they only operate', () => {
		// A system admin's list holds every org; 'AAA Corp' sorts first but is
		// not theirs, so a missing or stale cookie must not land them in it.
		const aaa = org('10000000-0000-0000-0000-000000000099', 'AAA Corp', { role: 'owner' });
		const isOwn = (candidate: OrgMembership) => candidate.id === acme.id;

		expect(resolveActiveOrg([aaa, acme], null, isOwn)).toBe(acme);
		expect(resolveActiveOrg([aaa, acme], '99999999-0000-0000-0000-000000000000', isOwn)).toBe(acme);
		// The cookie still wins when it names an org they may act in.
		expect(resolveActiveOrg([aaa, acme], aaa.id, isOwn)).toBe(aaa);
		// Nothing is their own: the first entry, so the type's promise holds.
		expect(resolveActiveOrg([aaa, acme], null, () => false)).toBe(aaa);
	});

	it('returns null for a user with no organizations', () => {
		expect(resolveActiveOrg([], acme.id)).toBeNull();
	});
});
