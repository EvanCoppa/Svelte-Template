import { describe, expect, it } from 'vitest';
import { resolveFeatures, type OrgFeatureState } from './resolve';
import type { FeatureRegistryRow } from './types';

function row(
	id: string,
	{ industries = ['general'], tiers = ['free'] }: { industries?: string[]; tiers?: string[] } = {}
): FeatureRegistryRow {
	return {
		id,
		name: id,
		description: null,
		route: `/${id}`,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z',
		industry_features: industries.map((industry_id) => ({ industry_id })),
		tier_features: tiers.map((tier_id) => ({ tier_id }))
	};
}

const org = (overrides: Partial<OrgFeatureState> = {}): OrgFeatureState => ({
	tierId: 'free',
	industryId: 'general',
	overrides: [],
	disabled: [],
	...overrides
});

describe('resolveFeatures', () => {
	it('enables a feature in the industry and the tier', () => {
		expect(resolveFeatures([row('clients')], org()).clients.mode).toBe('enabled');
	});

	it('locks a feature the industry has but the tier does not', () => {
		const registry = [row('deals', { tiers: ['pro'] })];
		expect(resolveFeatures(registry, org()).deals.mode).toBe('locked_visible');
	});

	it('hides a feature outside the industry, whatever the tier says', () => {
		const registry = [row('deals', { industries: ['construction'], tiers: ['free'] })];
		expect(resolveFeatures(registry, org()).deals.mode).toBe('hidden');
	});

	it('marks an available feature the org switched off as disabled', () => {
		const features = resolveFeatures([row('tasks')], org({ disabled: ['tasks'] }));
		expect(features.tasks.mode).toBe('disabled');
	});

	it('ignores an opt-out on a feature the org never had', () => {
		const registry = [row('deals', { tiers: ['pro'] }), row('hidden', { industries: [] })];
		const features = resolveFeatures(registry, org({ disabled: ['deals', 'hidden'] }));
		expect(features.deals.mode).toBe('locked_visible');
		expect(features.hidden.mode).toBe('hidden');
	});

	it('lets an enabled override win over industry and tier', () => {
		const registry = [row('deals', { industries: ['construction'], tiers: ['pro'] })];
		const features = resolveFeatures(
			registry,
			org({ overrides: [{ feature_id: 'deals', mode: 'enabled' }] })
		);
		expect(features.deals.mode).toBe('enabled');
	});

	it('still honours the org opt-out on an override-enabled feature', () => {
		const registry = [row('deals', { tiers: ['pro'] })];
		const features = resolveFeatures(
			registry,
			org({ overrides: [{ feature_id: 'deals', mode: 'enabled' }], disabled: ['deals'] })
		);
		expect(features.deals.mode).toBe('disabled');
	});

	it('lets locked and hidden overrides win over everything, including the opt-out', () => {
		const registry = [row('clients'), row('tasks')];
		const features = resolveFeatures(
			registry,
			org({
				overrides: [
					{ feature_id: 'clients', mode: 'locked_visible' },
					{ feature_id: 'tasks', mode: 'hidden' }
				],
				disabled: ['clients', 'tasks']
			})
		);
		expect(features.clients.mode).toBe('locked_visible');
		expect(features.tasks.mode).toBe('hidden');
	});

	it('returns every registry row, keyed by id, without the embedded maps', () => {
		const features = resolveFeatures([row('clients'), row('deals', { tiers: ['pro'] })], org());
		expect(Object.keys(features)).toEqual(['clients', 'deals']);
		expect(features.clients.feature).not.toHaveProperty('industry_features');
		expect(features.clients.feature).not.toHaveProperty('tier_features');
		expect(features.clients.feature.route).toBe('/clients');
	});

	it('resolves an empty registry to an empty map', () => {
		expect(resolveFeatures([], org())).toEqual({});
	});
});
