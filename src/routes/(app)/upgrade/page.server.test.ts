import { describe, expect, it } from 'vitest';
import { load } from './+page.server';
import type { OrgContext } from '$lib/server/org-context';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';

const feature = (id: string, name: string, sort_order = 0) => ({
	id,
	name,
	description: `${name} description`,
	route: `/${id}`,
	icon: null,
	category: 'platform',
	sort_order,
	created_at: ''
});

const org: OrgContext = {
	organizations: [],
	activeOrg: {
		id: ORG_ID,
		name: 'Acme Inc',
		role: 'member',
		tierId: 'pro',
		tierName: 'Pro',
		industryId: 'general'
	},
	features: {
		'best-practices': {
			feature: feature('best-practices', 'Best Practices', 20),
			mode: 'locked_visible'
		},
		clients: { feature: feature('clients', 'Clients', 10), mode: 'enabled' },
		secret: { feature: feature('secret', 'Secret'), mode: 'hidden' }
	},
	access: { role: 'member', roles: [], grants: new Map() }
};

const tiers = [
	{ id: 'enterprise', name: 'Enterprise', tier_features: [{ feature_id: 'best-practices' }] },
	{ id: 'free', name: 'Free', tier_features: [] },
	{ id: 'pro', name: 'Pro', tier_features: [{ feature_id: 'clients' }] }
];

async function run(search: string, { org: context = org, tiers: rows = tiers } = {}) {
	const { supabase } = supabaseMock({ data: rows });
	// SAFETY: the load reads locals.org, locals.supabase and url only.
	const data = await load({
		locals: { org: context, supabase },
		url: new URL(`https://app.test/upgrade${search}`)
	} as never);
	return loaded(data);
}

/** A PageServerLoad is typed as possibly returning void; ours never does. */
function loaded<T>(data: T | void): T {
	if (data === undefined) throw new Error('expected load data');
	// SAFETY: the guard above rules out the void branch.
	return data as T;
}

const bestPractices = {
	id: 'best-practices',
	name: 'Best Practices',
	description: 'Best Practices description'
};

describe('upgrade load', () => {
	it('names the locked feature and marks which tiers include it', async () => {
		const data = await run('?feature=best-practices');
		expect(data.feature?.name).toBe('Best Practices');
		expect(data.mode).toBe('locked_visible');
		expect(data.currentTier).toEqual({ id: 'pro', name: 'Pro' });
		expect(data.tiers).toEqual([
			{ id: 'enterprise', name: 'Enterprise', current: false, includes: true, featureCount: 1 },
			{ id: 'free', name: 'Free', current: false, includes: false, featureCount: 0 },
			{ id: 'pro', name: 'Pro', current: true, includes: false, featureCount: 1 }
		]);
	});

	it('still renders for an enabled feature, saying so', async () => {
		const data = await run('?feature=clients');
		expect(data.feature?.id).toBe('clients');
		expect(data.mode).toBe('enabled');
	});

	it('tolerates a missing or unknown feature id', async () => {
		expect((await run('')).feature).toBeNull();
		expect((await run('?feature=nope')).feature).toBeNull();
	});

	it('never names a hidden feature — it does not exist for this org', async () => {
		const data = await run('?feature=secret');
		expect(data.feature).toBeNull();
		expect(data.mode).toBeNull();
	});

	describe('recommended plan', () => {
		it('pitches the plan that unlocks the locked feature, listing what it adds', async () => {
			const data = await run('?feature=best-practices');
			expect(data.recommended).toEqual({
				id: 'enterprise',
				name: 'Enterprise',
				unlocks: [bestPractices]
			});
		});

		it('pitches the smallest plan that still includes the locked feature', async () => {
			const data = await run('?feature=best-practices', {
				tiers: [
					...tiers,
					{
						id: 'plus',
						name: 'Plus',
						tier_features: [{ feature_id: 'clients' }, { feature_id: 'best-practices' }]
					}
				]
			});
			expect(data.recommended?.id).toBe('enterprise');
		});

		it('falls back to the next step up when no feature is named or it is already enabled', async () => {
			expect((await run('')).recommended?.id).toBe('enterprise');
			expect((await run('?feature=clients')).recommended?.id).toBe('enterprise');
		});

		it('puts the wanted feature first, then registry order', async () => {
			const data = await run('?feature=best-practices', {
				org: {
					...org,
					activeOrg: { ...org.activeOrg, tierId: 'free', tierName: 'Free' },
					features: {
						...org.features,
						clients: { feature: feature('clients', 'Clients', 10), mode: 'locked_visible' },
						deals: { feature: feature('deals', 'Deals', 15), mode: 'locked_visible' }
					}
				},
				tiers: [
					{
						id: 'enterprise',
						name: 'Enterprise',
						tier_features: [
							{ feature_id: 'clients' },
							{ feature_id: 'deals' },
							{ feature_id: 'best-practices' }
						]
					},
					{ id: 'free', name: 'Free', tier_features: [] }
				]
			});
			expect(data.recommended?.unlocks).toEqual([
				bestPractices,
				{ id: 'clients', name: 'Clients', description: 'Clients description' },
				{ id: 'deals', name: 'Deals', description: 'Deals description' }
			]);
		});

		it('never lists a feature the org already has, or one that is hidden', async () => {
			const data = await run('', {
				tiers: [
					{
						id: 'enterprise',
						name: 'Enterprise',
						tier_features: [
							{ feature_id: 'clients' },
							{ feature_id: 'secret' },
							{ feature_id: 'best-practices' }
						]
					}
				]
			});
			expect(data.recommended?.unlocks).toEqual([bestPractices]);
		});

		it('pitches nothing on the top plan', async () => {
			const data = await run('', {
				org: {
					...org,
					activeOrg: { ...org.activeOrg, tierId: 'enterprise', tierName: 'Enterprise' },
					features: {
						...org.features,
						'best-practices': {
							feature: feature('best-practices', 'Best Practices', 20),
							mode: 'enabled'
						}
					}
				}
			});
			expect(data.recommended).toBeNull();
		});
	});
});
