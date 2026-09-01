import { describe, expect, it } from 'vitest';
import { loadFeatureRegistry, listTiersWithFeatures, setDisabledFeatures } from './features';
import { ORG_ID, supabaseMock } from './crm/test-support';

describe('loadFeatureRegistry', () => {
	it('loads every feature with its industry and tier maps, in nav order', async () => {
		const rows = [{ id: 'clients', industry_features: [], tier_features: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(loadFeatureRegistry(supabase)).resolves.toBe(rows);
		expect(from).toHaveBeenCalledWith('features');
		expect(builder.select).toHaveBeenCalledWith(
			'*, industry_features(industry_id), tier_features(tier_id)'
		);
		expect(builder.order).toHaveBeenCalledWith('sort_order');
	});

	it('throws the PostgREST message when the query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(loadFeatureRegistry(supabase)).rejects.toThrow('permission denied');
	});
});

describe('listTiersWithFeatures', () => {
	it('embeds each tier with the features it unlocks', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listTiersWithFeatures(supabase);
		expect(from).toHaveBeenCalledWith('tiers');
		expect(builder.select).toHaveBeenCalledWith('*, tier_features(feature_id)');
		expect(builder.order).toHaveBeenCalledWith('name');
	});
});

describe('setDisabledFeatures', () => {
	it('inserts opt-outs and deletes re-enabled ones, scoped to the org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await setDisabledFeatures(supabase, ORG_ID, {
			disable: ['tasks', 'deals'],
			enable: ['tickets']
		});
		expect(from).toHaveBeenCalledWith('organization_disabled_features');
		expect(builder.insert).toHaveBeenCalledWith([
			{ org_id: ORG_ID, feature_id: 'tasks' },
			{ org_id: ORG_ID, feature_id: 'deals' }
		]);
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.in).toHaveBeenCalledWith('feature_id', ['tickets']);
	});

	it('touches nothing when there is no diff', async () => {
		const { supabase, from } = supabaseMock({ data: null });

		await setDisabledFeatures(supabase, ORG_ID, { disable: [], enable: [] });
		expect(from).not.toHaveBeenCalled();
	});

	it('surfaces a refused insert (the RLS backstop) as an error', async () => {
		const { supabase } = supabaseMock({
			error: { message: 'new row violates row-level security' }
		});

		await expect(
			setDisabledFeatures(supabase, ORG_ID, { disable: ['deals'], enable: [] })
		).rejects.toThrow('row-level security');
	});
});
