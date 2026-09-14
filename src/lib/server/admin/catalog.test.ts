import { describe, expect, it } from 'vitest';
import {
	countPlatform,
	createIndustry,
	createTier,
	getFeature,
	getIndustry,
	getTier,
	listFeatureDirectory,
	listIndustryDirectory,
	listTierDirectory,
	membershipDiff,
	renameTier,
	setIndustryFeatureNaming,
	setIndustryFeatures,
	setTierFeatures,
	updateFeature
} from './catalog';
import { supabaseMock, supabaseMockSequence, supabaseTablesMock } from '../crm/test-support';

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

describe('membershipDiff', () => {
	it('names only what actually changed', () => {
		expect(membershipDiff(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
			add: ['d'],
			remove: ['a']
		});
	});

	it('is empty when nothing moved, so an unchanged save writes nothing', () => {
		expect(membershipDiff(['a', 'b'], ['b', 'a'])).toEqual({ add: [], remove: [] });
	});

	it('handles either side being empty', () => {
		expect(membershipDiff([], ['a'])).toEqual({ add: ['a'], remove: [] });
		expect(membershipDiff(['a'], [])).toEqual({ add: [], remove: ['a'] });
	});
});

describe('getTier', () => {
	it('reads the plan with what it unlocks and how many orgs are on it', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: {
				id: 'pro',
				name: 'Pro',
				organizations: [{ count: 6 }],
				tier_features: [{ feature_id: 'deals' }, { feature_id: 'tasks' }]
			}
		});

		await expect(getTier(supabase, 'pro')).resolves.toEqual({
			id: 'pro',
			name: 'Pro',
			organizations: 6,
			featureIds: ['deals', 'tasks']
		});
		expect(from).toHaveBeenCalledWith('tiers');
		expect(builder.eq).toHaveBeenCalledWith('id', 'pro');
	});

	it('answers null for a key that names no plan', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(getTier(supabase, 'nope')).resolves.toBeNull();
	});
});

describe('createTier', () => {
	it('inserts the plan with the key it was given', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await expect(createTier(supabase, { id: 'scale', name: 'Scale' })).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('tiers');
		expect(builder.insert).toHaveBeenCalledWith({ id: 'scale', name: 'Scale' });
	});

	it('surfaces a duplicate key rather than reporting success', async () => {
		const { supabase } = supabaseMock({
			error: { message: 'duplicate key value violates unique constraint "tiers_pkey"' }
		});

		await expect(createTier(supabase, { id: 'pro', name: 'Pro' })).rejects.toThrow('duplicate key');
	});
});

describe('renameTier', () => {
	it('throws rather than reporting success when no row came back', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(renameTier(supabase, 'gone', 'Gone')).rejects.toThrow('no longer exists');
	});
});

describe('setTierFeatures', () => {
	/**
	 * The rule both membership writers follow: touch only what changed. Here
	 * it keeps a `created_at` honest; on the industry axis it keeps a
	 * vertical's own words for a feature, which is why the same shape is
	 * tested twice.
	 */
	it('adds and removes only the difference', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: [{ feature_id: 'deals' }, { feature_id: 'tasks' }] },
			{ data: null },
			{ data: null }
		]);

		await setTierFeatures(supabase, 'pro', ['tasks', 'tickets']);

		expect(from).toHaveBeenCalledWith('tier_features');
		expect(builder.in).toHaveBeenCalledWith('feature_id', ['deals']);
		expect(builder.insert).toHaveBeenCalledWith([{ tier_id: 'pro', feature_id: 'tickets' }]);
	});

	it('writes nothing at all when the set is unchanged', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [{ feature_id: 'deals' }] },
			{ data: null }
		]);

		await setTierFeatures(supabase, 'pro', ['deals']);

		expect(builder.delete).not.toHaveBeenCalled();
		expect(builder.insert).not.toHaveBeenCalled();
	});
});

describe('getIndustry', () => {
	it('reads the vertical with its own name, noun and order per feature', async () => {
		const { supabase } = supabaseMock({
			data: {
				id: 'dentistry',
				name: 'Dentistry',
				organizations: [{ count: 2 }],
				industry_features: [
					{
						feature_id: 'proposals',
						name: 'Treatment plans',
						noun: 'treatment plan',
						sort_order: 100
					},
					{ feature_id: 'contacts', name: null, noun: 'patient', sort_order: null }
				]
			}
		});

		await expect(getIndustry(supabase, 'dentistry')).resolves.toEqual({
			id: 'dentistry',
			name: 'Dentistry',
			organizations: 2,
			// Null is not blank: it is "inherit the feature's own", column by
			// column, and it has to survive the read as null to stay that.
			features: [
				{ featureId: 'contacts', name: null, noun: 'patient', sortOrder: null },
				{
					featureId: 'proposals',
					name: 'Treatment plans',
					noun: 'treatment plan',
					sortOrder: 100
				}
			]
		});
	});
});

describe('createIndustry', () => {
	it('inserts the vertical with the key it was given', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await expect(
			createIndustry(supabase, { id: 'veterinary', name: 'Veterinary' })
		).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('industries');
		expect(builder.insert).toHaveBeenCalledWith({ id: 'veterinary', name: 'Veterinary' });
	});
});

describe('setIndustryFeatures', () => {
	/**
	 * The stakes the diff protects: an `industry_features` row also carries
	 * this vertical's name, noun and sidebar position for the feature. A
	 * delete-all-then-insert would throw all of that away for every feature
	 * that was only passing through.
	 */
	it('leaves an untouched row — and the words on it — alone', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: [{ feature_id: 'proposals' }, { feature_id: 'contacts' }] },
			{ data: null },
			{ data: null }
		]);

		await setIndustryFeatures(supabase, 'dentistry', ['proposals', 'calendar']);

		expect(from).toHaveBeenCalledWith('industry_features');
		// contacts goes, calendar arrives, and proposals is never written —
		// so "Treatment plans" survives.
		expect(builder.in).toHaveBeenCalledWith('feature_id', ['contacts']);
		expect(builder.insert).toHaveBeenCalledWith([
			{ industry_id: 'dentistry', feature_id: 'calendar' }
		]);
	});
});

describe('setIndustryFeatureNaming', () => {
	it('writes all three columns, scoped to the one row', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { feature_id: 'proposals' } });

		await setIndustryFeatureNaming(supabase, 'dentistry', 'proposals', {
			name: 'Treatment plans',
			noun: 'treatment plan',
			sortOrder: 100
		});

		expect(from).toHaveBeenCalledWith('industry_features');
		expect(builder.update).toHaveBeenCalledWith({
			name: 'Treatment plans',
			noun: 'treatment plan',
			sort_order: 100
		});
		expect(builder.eq).toHaveBeenCalledWith('industry_id', 'dentistry');
		expect(builder.eq).toHaveBeenCalledWith('feature_id', 'proposals');
	});

	it('writes null to clear an override back to the feature’s own word', async () => {
		const { supabase, builder } = supabaseMock({ data: { feature_id: 'proposals' } });

		await setIndustryFeatureNaming(supabase, 'dentistry', 'proposals', {
			name: null,
			noun: null,
			sortOrder: null
		});

		expect(builder.update).toHaveBeenCalledWith({ name: null, noun: null, sort_order: null });
	});

	it('refuses a feature the vertical does not include', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(
			setIndustryFeatureNaming(supabase, 'dentistry', 'deals', {
				name: null,
				noun: null,
				sortOrder: null
			})
		).rejects.toThrow('does not include that feature');
	});
});

describe('getFeature', () => {
	it('reads the row with the plans and verticals pointing at it', async () => {
		const { supabase } = supabaseMock({
			data: {
				id: 'deals',
				name: 'Deals',
				noun: 'deal',
				description: 'Pipeline of opportunities.',
				route: '/deals',
				icon: 'handshake',
				category: 'crm',
				sort_order: 200,
				tier_features: [{ tier_id: 'pro' }, { tier_id: 'enterprise' }],
				industry_features: [{ industry_id: 'crm' }]
			}
		});

		await expect(getFeature(supabase, 'deals')).resolves.toEqual({
			id: 'deals',
			name: 'Deals',
			noun: 'deal',
			description: 'Pipeline of opportunities.',
			route: '/deals',
			icon: 'handshake',
			category: 'crm',
			sortOrder: 200,
			tierIds: ['enterprise', 'pro'],
			industryIds: ['crm']
		});
	});
});

describe('updateFeature', () => {
	it('writes the metadata and nothing else — never the id or the route', async () => {
		// Both are facts about the code: the gate matches requests against the
		// route, and the id is what migrations and grants point at.
		const { supabase, builder } = supabaseMock({ data: { id: 'deals' } });

		await updateFeature(supabase, 'deals', {
			name: 'Opportunities',
			noun: 'opportunity',
			description: null,
			icon: 'handshake',
			category: 'crm',
			sortOrder: 200
		});

		expect(builder.update).toHaveBeenCalledWith({
			name: 'Opportunities',
			noun: 'opportunity',
			description: null,
			icon: 'handshake',
			category: 'crm',
			sort_order: 200
		});
		expect(builder.eq).toHaveBeenCalledWith('id', 'deals');
	});

	it('throws rather than reporting success when no row came back', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(
			updateFeature(supabase, 'gone', {
				name: 'Gone',
				noun: null,
				description: null,
				icon: null,
				category: null,
				sortOrder: 0
			})
		).rejects.toThrow('no longer exists');
	});
});
