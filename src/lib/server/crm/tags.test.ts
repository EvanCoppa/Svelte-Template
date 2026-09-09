import { describe, expect, it } from 'vitest';
import { listTaggedEntityIds, listTagsFor } from './tags';
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

	it('lists the ids of one kind of record carrying a tag, each once', async () => {
		const { supabase, builder } = supabaseMock({
			data: [{ entity_id: COMPANY_ID }, { entity_id: COMPANY_ID }, { entity_id: 'c2' }]
		});

		await expect(listTaggedEntityIds(supabase, ORG_ID, 'company', 'vip')).resolves.toEqual([
			COMPANY_ID,
			'c2'
		]);
		expect(builder.select).toHaveBeenCalledWith('entity_id, tags!inner(name)');
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builder.ilike).toHaveBeenCalledWith('tags.name', 'vip');
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(
			listTagsFor(supabase, ORG_ID, { entityType: 'company', entityId: COMPANY_ID })
		).rejects.toThrow('boom');
	});
});
