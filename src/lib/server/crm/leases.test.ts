import { describe, expect, it } from 'vitest';
import { createLease, deleteLease, getLease, listLeases, updateLease } from './leases';
import { ORG_ID, supabaseMock } from './test-support';

const LEASE_ID = 'c3000000-0000-0000-0000-000000000001';
const PROPERTY_ID = 'c1000000-0000-0000-0000-000000000011';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('leases data access', () => {
	it('lists the rent roll newest term first, with the property and the tenant', async () => {
		const rows = [{ id: LEASE_ID, rent_amount: 1650 }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listLeases(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('leases');
		expect(builder.select).toHaveBeenCalledWith(
			'*, properties(id, name, parent_id), companies(id, name), contacts(id, name)'
		);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('starts_on', { ascending: false });
	});

	it('filters by the property being rented', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listLeases(supabase, ORG_ID, { propertyId: PROPERTY_ID });
		expect(builder.eq).toHaveBeenCalledWith('property_id', PROPERTY_ID);
	});

	// A tenant is a party, so both sides filter by their own column — a
	// company tenant asking for "my leases" must not get everyone's.
	it('filters by either side of the party model', async () => {
		const person = supabaseMock({ data: [] });
		await listLeases(person.supabase, ORG_ID, { contactId: CONTACT_ID });
		expect(person.builder.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);

		const business = supabaseMock({ data: [] });
		await listLeases(business.supabase, ORG_ID, { companyId: COMPANY_ID });
		expect(business.builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
	});

	it('fetches one lease, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getLease(supabase, ORG_ID, LEASE_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', LEASE_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a lease in the org, leaving authorship to the database', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: LEASE_ID } });

		await createLease(supabase, ORG_ID, {
			property_id: PROPERTY_ID,
			company_id: null,
			contact_id: CONTACT_ID,
			starts_on: '2026-01-01',
			// Month-to-month: a null end date is the tenancy shape, not a gap
			// in the data, so it goes to the column as null.
			ends_on: null,
			rent_amount: 1650,
			rent_due_day: 1,
			security_deposit: 1650,
			currency: 'USD',
			notes: null
		});
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ org_id: ORG_ID, ends_on: null, contact_id: CONTACT_ID })
		);
		expect(builder.insert.mock.calls[0][0]).not.toHaveProperty('created_by');
	});

	it('updates a lease within its org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: LEASE_ID } });

		// Ending a lease early is moving the end date, not a status change —
		// there is no status column to change.
		await updateLease(supabase, ORG_ID, LEASE_ID, { ends_on: '2026-06-30' });
		expect(builder.update).toHaveBeenCalledWith({ ends_on: '2026-06-30' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', LEASE_ID);
	});

	it('throws when a delete removes nothing — RLS refused it', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteLease(supabase, ORG_ID, LEASE_ID)).rejects.toThrow(/Lease/);
	});
});
