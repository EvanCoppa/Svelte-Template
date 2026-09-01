import { describe, expect, it } from 'vitest';
import { load } from './+page.server';
import type { OrgContext } from '$lib/server/org-context';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';

const feature = (id: string, name: string) => ({
	id,
	name,
	description: `${name} description`,
	route: `/${id}`,
	icon: null,
	category: 'platform',
	sort_order: 0,
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
			feature: feature('best-practices', 'Best Practices'),
			mode: 'locked_visible'
		},
		clients: { feature: feature('clients', 'Clients'), mode: 'enabled' },
		secret: { feature: feature('secret', 'Secret'), mode: 'hidden' }
	},
	access: { role: 'member', roles: [], grants: new Map() }
};

const tiers = [
	{ id: 'enterprise', name: 'Enterprise', tier_features: [{ feature_id: 'best-practices' }] },
	{ id: 'free', name: 'Free', tier_features: [] },
	{ id: 'pro', name: 'Pro', tier_features: [{ feature_id: 'clients' }] }
];

async function run(search: string) {
	const { supabase } = supabaseMock({ data: tiers });
	// SAFETY: the load reads locals.org, locals.supabase and url only.
	const data = await load({
		locals: { org, supabase },
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
});
