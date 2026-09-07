import { describe, expect, it } from 'vitest';
import {
	createCompany,
	deleteCompany,
	getCompany,
	listCompanies,
	updateCompany
} from './companies';
import { ORG_ID, supabaseMock } from './test-support';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('companies data access', () => {
	it('lists an org’s companies by name', async () => {
		const rows = [{ id: COMPANY_ID, name: 'Wayne Enterprises' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listCompanies(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('companies');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('filters by relationship only when asked', async () => {
		const unfiltered = supabaseMock({ data: [] });
		await listCompanies(unfiltered.supabase, ORG_ID);
		expect(unfiltered.builder.eq).toHaveBeenCalledTimes(1);

		const filtered = supabaseMock({ data: [] });
		await listCompanies(filtered.supabase, ORG_ID, { relationship: 'supplier' });
		expect(filtered.builder.eq).toHaveBeenCalledWith('relationship', 'supplier');
	});

	it('fetches one company with its people, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getCompany(supabase, ORG_ID, COMPANY_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*, contacts(*)');
		expect(builder.eq).toHaveBeenCalledWith('id', COMPANY_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a company under the org without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: COMPANY_ID } });

		await createCompany(supabase, ORG_ID, { name: 'Stark Industries', relationship: 'customer' });
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Stark Industries',
			relationship: 'customer',
			org_id: ORG_ID
		});
	});

	it('updates scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: COMPANY_ID } });

		await updateCompany(supabase, ORG_ID, COMPANY_ID, { status: 'active' });
		expect(builder.update).toHaveBeenCalledWith({ status: 'active' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', COMPANY_ID);
	});

	it('deletes scoped to org and id, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: COMPANY_ID }] });
		await deleteCompany(deleted.supabase, ORG_ID, COMPANY_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteCompany(filtered.supabase, ORG_ID, COMPANY_ID)).rejects.toThrow(
			'Company was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listCompanies(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});
