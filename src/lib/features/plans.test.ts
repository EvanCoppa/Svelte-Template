import { describe, expect, it } from 'vitest';
import { pitchFor, upgradePlans, type UpgradePlan } from './plans';
import type { FeatureMap, FeatureMode } from './types';

function feature(id: string, name: string, mode: FeatureMode, sort_order = 0) {
	return {
		feature: {
			id,
			name,
			description: `${name} description`,
			route: `/${id}`,
			icon: null,
			category: 'platform',
			sort_order,
			created_at: ''
		},
		mode
	};
}

const unlock = (id: string, name: string) => ({
	id,
	name,
	description: `${name} description`,
	icon: null
});

// An industry that has everything but `secret`: Free carries clients, Pro
// adds deals, Enterprise adds best practices. Each org's map is what the
// resolver would produce for its own plan.
const freeOrg: FeatureMap = {
	clients: feature('clients', 'Clients', 'enabled', 10),
	deals: feature('deals', 'Deals', 'locked_visible', 20),
	'best-practices': feature('best-practices', 'Best Practices', 'locked_visible', 30),
	secret: feature('secret', 'Secret', 'hidden')
};
const proOrg: FeatureMap = { ...freeOrg, deals: feature('deals', 'Deals', 'enabled', 20) };
const enterpriseOrg: FeatureMap = {
	...proOrg,
	'best-practices': feature('best-practices', 'Best Practices', 'enabled', 30)
};

const tiers = [
	{
		id: 'enterprise',
		name: 'Enterprise',
		tier_features: [
			{ feature_id: 'clients' },
			{ feature_id: 'best-practices' },
			{ feature_id: 'secret' },
			{ feature_id: 'deals' }
		]
	},
	{ id: 'free', name: 'Free', tier_features: [{ feature_id: 'clients' }] },
	{ id: 'pro', name: 'Pro', tier_features: [{ feature_id: 'clients' }, { feature_id: 'deals' }] }
];

// The plans as a Free org sees them.
const pro: UpgradePlan = { id: 'pro', name: 'Pro', unlocks: [unlock('deals', 'Deals')] };
const enterprise: UpgradePlan = {
	id: 'enterprise',
	name: 'Enterprise',
	unlocks: [unlock('deals', 'Deals'), unlock('best-practices', 'Best Practices')]
};

describe('upgradePlans', () => {
	it('lists every other plan that unlocks something, smallest first, in registry order', () => {
		expect(upgradePlans(tiers, freeOrg, 'free')).toEqual([pro, enterprise]);
	});

	it("never lists the org's own plan, a feature it already has, or a hidden one", () => {
		expect(upgradePlans(tiers, proOrg, 'pro')).toEqual([
			{ ...enterprise, unlocks: [unlock('best-practices', 'Best Practices')] }
		]);
	});

	it('is empty on the top plan', () => {
		expect(upgradePlans(tiers, enterpriseOrg, 'enterprise')).toEqual([]);
	});
});

describe('pitchFor', () => {
	it('pitches the smallest plan that unlocks the feature, listing that feature first', () => {
		expect(pitchFor([pro, enterprise], 'best-practices')).toEqual({
			plan: enterprise,
			feature: unlock('best-practices', 'Best Practices'),
			unlocks: [unlock('best-practices', 'Best Practices'), unlock('deals', 'Deals')]
		});
		expect(pitchFor([pro, enterprise], 'deals')?.plan).toEqual(pro);
	});

	it('falls back to the next step up when no feature is named or none unlocks it', () => {
		expect(pitchFor([pro, enterprise], null)).toEqual({
			plan: pro,
			feature: null,
			unlocks: pro.unlocks
		});
		expect(pitchFor([pro, enterprise], 'clients')?.plan).toEqual(pro);
		expect(pitchFor([pro, enterprise], 'clients')?.feature).toBeNull();
	});

	it('has nothing to pitch on the top plan', () => {
		expect(pitchFor([], null)).toBeNull();
		expect(pitchFor([], 'deals')).toBeNull();
	});
});
