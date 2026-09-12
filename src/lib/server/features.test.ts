import { describe, expect, it } from 'vitest';
import {
	loadFeatureRegistry,
	loadTermRegistry,
	loadViewRegistry,
	loadVocabulary,
	listTiersWithFeatures,
	setDisabledFeatures
} from './features';
import { ORG_ID, supabaseMock } from './crm/test-support';

describe('loadFeatureRegistry', () => {
	it('loads every feature with its industry and tier maps, in nav order', async () => {
		const rows = [{ id: 'companies', industry_features: [], tier_features: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(loadFeatureRegistry(supabase)).resolves.toBe(rows);
		expect(from).toHaveBeenCalledWith('features');
		// Each industry row carries the industry's own words for the feature.
		expect(builder.select).toHaveBeenCalledWith(
			'*, industry_features(industry_id, name, noun, sort_order), tier_features(tier_id)'
		);
		expect(builder.order).toHaveBeenCalledWith('sort_order');
	});

	it('throws the PostgREST message when the query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(loadFeatureRegistry(supabase)).rejects.toThrow('permission denied');
	});
});

describe('loadViewRegistry', () => {
	it('loads every view definition, by id', async () => {
		const rows = [{ id: 'suppliers', source: 'company' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(loadViewRegistry(supabase)).resolves.toBe(rows);
		expect(from).toHaveBeenCalledWith('views');
		expect(builder.select).toHaveBeenCalledWith('id, source, filter, layouts, default_layout');
		expect(builder.order).toHaveBeenCalledWith('id');
	});
});

describe('loadTermRegistry', () => {
	it("loads every term with each industry's own word, by id", async () => {
		const rows = [{ id: 'proposal_presenter', label: 'Presenter', industry_terms: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(loadTermRegistry(supabase)).resolves.toBe(rows);
		expect(from).toHaveBeenCalledWith('terms');
		expect(builder.select).toHaveBeenCalledWith('*, industry_terms(industry_id, label)');
		expect(builder.order).toHaveBeenCalledWith('id');
	});

	it('resolves the vocabulary for one industry in the same round trip', async () => {
		const { supabase } = supabaseMock({
			data: [
				{
					id: 'proposal_presenter',
					label: 'Presenter',
					industry_terms: [{ industry_id: 'roofing', label: 'Estimator' }]
				},
				{ id: 'proposal_responsible', label: 'Responsible', industry_terms: [] }
			]
		});

		await expect(loadVocabulary(supabase, 'roofing')).resolves.toEqual({
			proposal_presenter: 'Estimator',
			proposal_responsible: 'Responsible'
		});
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
