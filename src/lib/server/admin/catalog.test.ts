import { describe, expect, it } from 'vitest';
import {
	countPlatform,
	listFeatureDirectory,
	listIndustryDirectory,
	listTierDirectory
} from './catalog';
import { supabaseMock, supabaseTablesMock } from '../crm/test-support';

describe('listTierDirectory', () => {
	it('orders plans cheapest first — fewest features, because plans nest', async () => {
		// The same ordering the upgrade prompt pitches in, rather than a price
		// column the schema does not have.
		const { supabase, from } = supabaseMock({
			data: [
				{
					id: 'enterprise',
					name: 'Enterprise',
					organizations: [{ count: 4 }],
					tier_features: [{ count: 21 }]
				},
				{ id: 'free', name: 'Free', organizations: [{ count: 7 }], tier_features: [{ count: 17 }] },
				{ id: 'pro', name: 'Pro', organizations: [{ count: 6 }], tier_features: [{ count: 20 }] }
			]
		});

		await expect(listTierDirectory(supabase)).resolves.toEqual([
			{ id: 'free', name: 'Free', organizations: 7, features: 17 },
			{ id: 'pro', name: 'Pro', organizations: 6, features: 20 },
			{ id: 'enterprise', name: 'Enterprise', organizations: 4, features: 21 }
		]);
		expect(from).toHaveBeenCalledWith('tiers');
	});

	it('reads a missing aggregate as zero', async () => {
		const { supabase } = supabaseMock({
			data: [{ id: 'free', name: 'Free', organizations: [], tier_features: [] }]
		});

		await expect(listTierDirectory(supabase)).resolves.toEqual([
			{ id: 'free', name: 'Free', organizations: 0, features: 0 }
		]);
	});
});

describe('listIndustryDirectory', () => {
	it('lists verticals by name with what sits in each', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [
				{
					id: 'crm',
					name: 'CRM',
					organizations: [{ count: 6 }],
					industry_features: [{ count: 20 }]
				}
			]
		});

		await expect(listIndustryDirectory(supabase)).resolves.toEqual([
			{ id: 'crm', name: 'CRM', organizations: 6, features: 20 }
		]);
		expect(from).toHaveBeenCalledWith('industries');
		expect(builder.order).toHaveBeenCalledWith('name');
	});
});

describe('listFeatureDirectory', () => {
	it('reads the one registry query and counts the two maps on each row', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [
				{
					id: 'companies',
					name: 'Clients',
					route: '/companies',
					category: 'crm',
					icon: 'users',
					sort_order: 100,
					tier_features: [{ tier_id: 'free' }, { tier_id: 'pro' }],
					industry_features: [{ industry_id: 'crm' }]
				}
			]
		});

		await expect(listFeatureDirectory(supabase)).resolves.toEqual([
			{
				id: 'companies',
				name: 'Clients',
				route: '/companies',
				category: 'crm',
				icon: 'users',
				sortOrder: 100,
				plans: 2,
				industries: 1
			}
		]);
		// Whatever the registry loader selects is what the directory shows —
		// the resolver and this page can never read different registries.
		expect(from).toHaveBeenCalledWith('features');
		expect(builder.order).toHaveBeenCalledWith('sort_order');
	});
});

describe('countPlatform', () => {
	it('counts each catalog with a head request', async () => {
		const { supabase, builders } = supabaseTablesMock({
			organizations: { count: 17 },
			tiers: { count: 3 },
			industries: { count: 6 },
			features: { count: 21 }
		});

		await expect(countPlatform(supabase)).resolves.toEqual({
			organizations: 17,
			tiers: 3,
			industries: 6,
			features: 21
		});
		expect(builders['organizations']?.select).toHaveBeenCalledWith('*', {
			count: 'exact',
			head: true
		});
	});

	it('throws the PostgREST message when a count fails', async () => {
		const { supabase } = supabaseTablesMock({
			organizations: { error: { message: 'permission denied' } }
		});

		await expect(countPlatform(supabase)).rejects.toThrow('permission denied');
	});
});
