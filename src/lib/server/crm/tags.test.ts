import { describe, expect, it } from 'vitest';
import { listTagsFor } from './tags';
import { ORG_ID, supabaseMock } from './test-support';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('tags data access', () => {
	it('lists the tags on one record through the taggings link, by name', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [{ tags: { id: 't2', name: 'VIP' } }, { tags: { id: 't1', name: 'Coastal' } }]
		});

		await expect(
			listTagsFor(supabase, ORG_ID, { entityType: 'company', entityId: COMPANY_ID })
		).resolves.toEqual([
			{ id: 't1', name: 'Coastal' },
			{ id: 't2', name: 'VIP' }
		]);
		expect(from).toHaveBeenCalledWith('taggings');
		expect(builder.select).toHaveBeenCalledWith('tags!inner(*)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', COMPANY_ID);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(
			listTagsFor(supabase, ORG_ID, { entityType: 'company', entityId: COMPANY_ID })
		).rejects.toThrow('boom');
	});
});
