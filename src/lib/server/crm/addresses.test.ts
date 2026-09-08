import { describe, expect, it } from 'vitest';
import { listAddresses } from './addresses';
import { ORG_ID, supabaseMock } from './test-support';

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';

describe('addresses data access', () => {
	it('lists a party’s addresses, the primary one first', async () => {
		const rows = [{ id: 'a1', line1: '1007 Mountain Drive', is_primary: true }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(
			listAddresses(supabase, ORG_ID, { entityType: 'contact', entityId: CONTACT_ID })
		).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('addresses');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'contact');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', CONTACT_ID);
		expect(builder.order).toHaveBeenCalledWith('is_primary', { ascending: false });
		expect(builder.order).toHaveBeenCalledWith('created_at');
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(
			listAddresses(supabase, ORG_ID, { entityType: 'contact', entityId: CONTACT_ID })
		).rejects.toThrow('boom');
	});
});
