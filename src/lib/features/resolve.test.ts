import { describe, expect, it } from 'vitest';
import { isVisible, resolveFeatures, type OrgFeatureState } from './resolve';
import type { FeatureRegistryRow } from './types';

type IndustryRow = FeatureRegistryRow['industry_features'][number];

/** An industry that includes the feature, calling it by its own words or not. */
function industry(industry_id: string, words: { name?: string; noun?: string } = {}): IndustryRow {
	return { industry_id, name: words.name ?? null, noun: words.noun ?? null };
}

function row(
	id: string,
	{
		industries = [industry('general')],
		tiers = ['free'],
		noun = null
	}: { industries?: IndustryRow[]; tiers?: string[]; noun?: string | null } = {}
): FeatureRegistryRow {
	return {
		id,
		name: id,
		noun,
		description: null,
		route: `/${id}`,
		icon: null,
		category: 'crm',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z',
		industry_features: industries,
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
		expect(resolveFeatures([row('companies')], org()).companies.mode).toBe('enabled');
	});

	it('locks a feature the industry has but the tier does not', () => {
		const registry = [row('deals', { tiers: ['pro'] })];
		expect(resolveFeatures(registry, org()).deals.mode).toBe('locked_visible');
	});

	it('hides a feature outside the industry, whatever the tier says', () => {
		const registry = [row('deals', { industries: [industry('construction')], tiers: ['free'] })];
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
		const registry = [row('deals', { industries: [industry('construction')], tiers: ['pro'] })];
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
		const registry = [row('companies'), row('tasks')];
		const features = resolveFeatures(
			registry,
			org({
				overrides: [
					{ feature_id: 'companies', mode: 'locked_visible' },
					{ feature_id: 'tasks', mode: 'hidden' }
				],
				disabled: ['companies', 'tasks']
			})
		);
		expect(features.companies.mode).toBe('locked_visible');
		expect(features.tasks.mode).toBe('hidden');
	});

	it('returns every registry row, keyed by id, without the embedded maps', () => {
		const features = resolveFeatures([row('companies'), row('deals', { tiers: ['pro'] })], org());
		expect(Object.keys(features)).toEqual(['companies', 'deals']);
		expect(features.companies.feature).not.toHaveProperty('industry_features');
		expect(features.companies.feature).not.toHaveProperty('tier_features');
		expect(features.companies.feature.route).toBe('/companies');
	});

	it('resolves an empty registry to an empty map', () => {
		expect(resolveFeatures([], org())).toEqual({});
	});
});

describe('resolveFeatures — what the industry calls a feature', () => {
	const proposals = row('proposals', {
		noun: 'proposal',
		industries: [
			industry('general'),
			industry('dentistry', { name: 'Treatment plans', noun: 'treatment plan' }),
			industry('roofing', { name: 'Quotes' })
		]
	});

	it("takes the active industry's own name and noun", () => {
		const { feature } = resolveFeatures([proposals], org({ industryId: 'dentistry' })).proposals;
		expect(feature.name).toBe('Treatment plans');
		expect(feature.noun).toBe('treatment plan');
	});

	it("inherits the feature's words where the industry row leaves them null", () => {
		const general = resolveFeatures([proposals], org()).proposals.feature;
		expect(general).toMatchObject({ name: 'proposals', noun: 'proposal' });
		// A name without a noun: the noun still inherits.
		const roofing = resolveFeatures([proposals], org({ industryId: 'roofing' })).proposals.feature;
		expect(roofing).toMatchObject({ name: 'Quotes', noun: 'proposal' });
	});

	it("never borrows another industry's words, even when an override enables the feature", () => {
		const outside = org({
			industryId: 'beverage',
			overrides: [{ feature_id: 'proposals', mode: 'enabled' }]
		});
		const { feature, mode } = resolveFeatures([proposals], outside).proposals;
		expect(mode).toBe('enabled');
		expect(feature).toMatchObject({ name: 'proposals', noun: 'proposal' });
	});
});

describe('isVisible', () => {
	const readAll = () => true;
	const resolved = (mode: 'enabled' | 'locked_visible' | 'disabled' | 'hidden') => ({
		feature: resolveFeatures([row('deals')], org()).deals.feature,
		mode
	});

	it('shows enabled and locked features, and hides disabled and hidden ones', () => {
		expect(isVisible(resolved('enabled'), readAll)).toBe(true);
		expect(isVisible(resolved('locked_visible'), readAll)).toBe(true);
		expect(isVisible(resolved('disabled'), readAll)).toBe(false);
		expect(isVisible(resolved('hidden'), readAll)).toBe(false);
	});

	it('hides a feature the caller cannot read, locked ones included', () => {
		expect(isVisible(resolved('enabled'), () => false)).toBe(false);
		expect(isVisible(resolved('locked_visible'), (id) => id !== 'deals')).toBe(false);
	});
});
