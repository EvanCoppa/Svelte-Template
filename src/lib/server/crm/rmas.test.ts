import { describe, expect, it } from 'vitest';
import { createRma, deleteRma, getRma, listRmas, updateRma } from './rmas';
import { ORG_ID, supabaseMock } from './test-support';

const RMA_ID = 'f4000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

describe('rmas data access', () => {
	it('lists the org’s returns with their customer, newest first', async () => {
		const rows = [{ id: RMA_ID, number: 'RMA-00001' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listRmas(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('rmas');
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name), contacts(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('filters by either side of the party, and by the open queue', async () => {
		const byCompany = supabaseMock({ data: [] });
		await listRmas(byCompany.supabase, ORG_ID, { companyId: COMPANY_ID });
		expect(byCompany.builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);

		const byContact = supabaseMock({ data: [] });
		await listRmas(byContact.supabase, ORG_ID, { contactId: CONTACT_ID });
		expect(byContact.builder.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);

		// Everything that has not reached an end state — `closed` and
		// `rejected` are the two ends.
		const open = supabaseMock({ data: [] });
		await listRmas(open.supabase, ORG_ID, { openOnly: true });
		expect(open.builder.in).toHaveBeenCalledWith('status', ['requested', 'approved', 'received']);
	});

	it('fetches one return, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getRma(supabase, ORG_ID, RMA_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', RMA_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a return without naming its number — that is the database’s', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: RMA_ID } });

		await createRma(supabase, ORG_ID, {
			company_id: COMPANY_ID,
			contact_id: null,
			status: 'requested',
			reason: 'Two cases arrived torn'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: null,
			status: 'requested',
			reason: 'Two cases arrived torn',
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: RMA_ID } });
		await updateRma(updated.supabase, ORG_ID, RMA_ID, {
			status: 'closed',
			resolution: 'Replaced'
		});
		expect(updated.builder.update).toHaveBeenCalledWith({
			status: 'closed',
			resolution: 'Replaced'
		});
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', RMA_ID);

		const deleted = supabaseMock({ data: [{ id: RMA_ID }] });
		await deleteRma(deleted.supabase, ORG_ID, RMA_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteRma(filtered.supabase, ORG_ID, RMA_ID)).rejects.toThrow(
			'Return was not deleted'
		);
	});
});
