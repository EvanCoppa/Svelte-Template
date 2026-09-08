import { describe, expect, it } from 'vitest';
import { defaultPipeline, listPipelines } from './pipelines';
import { ORG_ID, supabaseMock } from './test-support';

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
});
