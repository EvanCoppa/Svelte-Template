import { describe, expect, it } from 'vitest';
import {
	createAddress,
	deleteAddress,
	listAddresses,
	listAddressesFor,
	updateAddress
} from './addresses';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

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

	it('lists the addresses of many records in one read, and none for no records', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listAddressesFor(supabase, ORG_ID, 'company', ['c1', 'c2']);
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builder.in).toHaveBeenCalledWith('entity_id', ['c1', 'c2']);
		expect(builder.order).toHaveBeenCalledWith('is_primary', { ascending: false });

		const none = supabaseMock({ data: [] });
		await expect(listAddressesFor(none.supabase, ORG_ID, 'company', [])).resolves.toEqual([]);
		expect(none.from).not.toHaveBeenCalled();
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('creates an address on a party, demoting the old primary first only when it is primary', async () => {
		const plain = supabaseMockSequence([{ data: { id: 'a1' } }]);
		await createAddress(
			plain.supabase,
			ORG_ID,
			{ entityType: 'contact', entityId: CONTACT_ID },
			{ line1: '1 Main St', is_primary: false }
		);
		expect(plain.from).toHaveBeenCalledTimes(1);
		expect(plain.builder.insert).toHaveBeenCalledWith({
			line1: '1 Main St',
			is_primary: false,
			org_id: ORG_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID
		});

		const primary = supabaseMockSequence([{ data: null }, { data: { id: 'a2' } }]);
		await createAddress(
			primary.supabase,
			ORG_ID,
			{ entityType: 'contact', entityId: CONTACT_ID },
			{ line1: '1 Main St', is_primary: true, latitude: 40.5, longitude: -74.2 }
		);
		expect(primary.from).toHaveBeenCalledTimes(2);
		expect(primary.builder.update).toHaveBeenCalledWith({ is_primary: false });
		expect(primary.builder.eq).toHaveBeenCalledWith('is_primary', true);
	});

	it('updates and deletes scoped to org and id', async () => {
		const updated = supabaseMock({ data: { id: 'a1' } });
		await updateAddress(
			updated.supabase,
			ORG_ID,
			{ entityType: 'contact', entityId: CONTACT_ID },
			'a1',
			{ city: 'Gotham' }
		);
		expect(updated.builder.update).toHaveBeenCalledWith({ city: 'Gotham' });
		expect(updated.builder.eq).toHaveBeenCalledWith('id', 'a1');

		const deleted = supabaseMock({ data: [{ id: 'a1' }] });
		await deleteAddress(deleted.supabase, ORG_ID, 'a1');
		expect(deleted.builder.select).toHaveBeenCalledWith('id');
		const gone = supabaseMock({ data: [] });
		await expect(deleteAddress(gone.supabase, ORG_ID, 'a1')).rejects.toThrow(
			'Address was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(
			listAddresses(supabase, ORG_ID, { entityType: 'contact', entityId: CONTACT_ID })
		).rejects.toThrow('boom');
	});
});
