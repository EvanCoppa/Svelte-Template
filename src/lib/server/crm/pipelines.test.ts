import { describe, expect, it } from 'vitest';
import { defaultPipeline, getStageName, listPipelines } from './pipelines';
import { ORG_ID, supabaseMock } from './test-support';

const STAGE_ID = '50000000-0000-0000-0000-000000000001';

describe('pipelines data access', () => {
	it('lists boards with their columns, both in display order', async () => {
		const rows = [{ id: 'p1', name: 'Sales', pipeline_stages: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listPipelines(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('pipelines');
		expect(builder.select).toHaveBeenCalledWith('*, pipeline_stages(*)');
		expect(builder.order).toHaveBeenCalledWith('sort_order');
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'pipeline_stages'
		});
	});

	it('finds the board new deals land in', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(defaultPipeline(supabase, ORG_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('is_default', true);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('names a stage for a timeline entry, scoped by RLS rather than an org filter', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { name: 'Qualification' } });

		await expect(getStageName(supabase, STAGE_ID)).resolves.toBe('Qualification');
		expect(from).toHaveBeenCalledWith('pipeline_stages');
		expect(builder.select).toHaveBeenCalledWith('name');
		expect(builder.eq).toHaveBeenCalledWith('id', STAGE_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('names no stage when the id is not visible', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(getStageName(supabase, STAGE_ID)).resolves.toBeNull();
	});
});
