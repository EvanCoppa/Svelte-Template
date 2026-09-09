import { describe, expect, it } from 'vitest';
import { createContact, deleteContact, getContact, listContacts, updateContact } from './contacts';
import { ORG_ID, supabaseMock } from './test-support';

const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('contacts data access', () => {
	it('lists people with the company they belong to', async () => {
		const rows = [{ id: CONTACT_ID, name: 'Lucius Fox' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listContacts(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('contacts');
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
	});

	it('filters to one company when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listContacts(supabase, ORG_ID, { companyId: COMPANY_ID });
		expect(builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
	});

	it('finds the people who stand alone — the patient, the homeowner', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listContacts(supabase, ORG_ID, { unattachedOnly: true });
		expect(builder.is).toHaveBeenCalledWith('company_id', null);
	});

	it('compiles a view’s conditions into the query, including whether a company exists', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });
		await listContacts(supabase, ORG_ID, {
			ids: [CONTACT_ID],
			conditions: [
				{ field: 'has_company', op: 'eq', value: false },
				{ field: 'company_id', op: 'in', values: [COMPANY_ID] },
				{ field: 'title', op: 'ilike', value: 'CEO' }
			],
			sort: { field: 'created_at', direction: 'desc' }
		});
		expect(builder.in).toHaveBeenCalledWith('id', [CONTACT_ID]);
		expect(builder.is).toHaveBeenCalledWith('company_id', null);
		expect(builder.in).toHaveBeenCalledWith('company_id', [COMPANY_ID]);
		expect(builder.ilike).toHaveBeenCalledWith('title', '%CEO%');
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('creates a contact with no company at all', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CONTACT_ID } });

		await createContact(supabase, ORG_ID, { name: 'A Homeowner', status: 'lead' });
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'A Homeowner',
			status: 'lead',
			org_id: ORG_ID
		});
	});

	it('fetches one contact, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getContact(supabase, ORG_ID, CONTACT_ID)).resolves.toBeNull();
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('updates scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CONTACT_ID } });

		await updateContact(supabase, ORG_ID, CONTACT_ID, { company_id: COMPANY_ID });
		expect(builder.update).toHaveBeenCalledWith({ company_id: COMPANY_ID });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
	});

	it('deletes scoped to org and id, throwing on zero rows', async () => {
		const filtered = supabaseMock({ data: [] });
		await expect(deleteContact(filtered.supabase, ORG_ID, CONTACT_ID)).rejects.toThrow(
			'Contact was not deleted'
		);
	});
});
