import { describe, expect, it } from 'vitest';
import { createDeal, deleteDeal, getDeal, listDeals, updateDeal } from './deals';
import { ORG_ID, supabaseMock } from './test-support';

const DEAL_ID = '40000000-0000-0000-0000-000000000001';
const CLIENT_ID = '20000000-0000-0000-0000-000000000001';

describe('deals data access', () => {
	it('lists deals with their client, newest first', async () => {
		const rows = [{ id: DEAL_ID, title: 'Annual support contract' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listDeals(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('deals');
		expect(builder.select).toHaveBeenCalledWith('*, clients(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
	});

	it('filters by client and stage only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listDeals(supabase, ORG_ID, { clientId: CLIENT_ID, stage: 'proposal' });
		expect(builder.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
		expect(builder.eq).toHaveBeenCalledWith('stage', 'proposal');
	});

	it('fetches one deal with its client, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getDeal(supabase, ORG_ID, DEAL_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*, clients(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('id', DEAL_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a deal under the org without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: DEAL_ID } });

		await createDeal(supabase, ORG_ID, {
			client_id: CLIENT_ID,
			title: 'Renewal',
			amount: 24000
		});
		expect(builder.insert).toHaveBeenCalledWith({
			client_id: CLIENT_ID,
			title: 'Renewal',
			amount: 24000,
			org_id: ORG_ID
		});
	});

	it('updates and deletes scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: DEAL_ID } });

		await updateDeal(supabase, ORG_ID, DEAL_ID, { stage: 'won' });
		expect(builder.update).toHaveBeenCalledWith({ stage: 'won' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', DEAL_ID);

		await deleteDeal(supabase, ORG_ID, DEAL_ID);
		expect(builder.delete).toHaveBeenCalled();
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listDeals(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});
