import { describe, expect, it } from 'vitest';
import {
	createBillable,
	deleteBillable,
	getBillable,
	listBillables,
	updateBillable
} from './billables';
import { ORG_ID, supabaseMock } from './test-support';

const BILLABLE_ID = 'c1000000-0000-0000-0000-000000000001';

describe('billables data access', () => {
	it('lists the schedule in its own order, then by name', async () => {
		const rows = [{ id: BILLABLE_ID, name: 'Porcelain crown' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listBillables(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('billables');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenNthCalledWith(1, 'sort_order');
		expect(builder.order).toHaveBeenNthCalledWith(2, 'name');
	});

	it('filters retired entries out, and down to the featured ones, only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listBillables(supabase, ORG_ID, { activeOnly: true, featuredOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('is_active', true);
		expect(builder.eq).toHaveBeenCalledWith('is_featured', true);

		const bare = supabaseMock({ data: [] });
		await listBillables(bare.supabase, ORG_ID);
		expect(bare.builder.eq).toHaveBeenCalledTimes(1);
	});

	it('fetches one billable, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getBillable(supabase, ORG_ID, BILLABLE_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', BILLABLE_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a billable in the org, with its unit choices as an array', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: BILLABLE_ID } });

		await createBillable(supabase, ORG_ID, {
			name: 'Scaling and root planing',
			code: 'D4341',
			unit_price: 275,
			unit: 'quadrant',
			unit_choices: ['UR', 'UL', 'BR', 'BL'],
			is_featured: true
		});
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'D4341',
				unit_choices: ['UR', 'UL', 'BR', 'BL'],
				org_id: ORG_ID
			})
		);
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: BILLABLE_ID } });
		await updateBillable(updated.supabase, ORG_ID, BILLABLE_ID, { is_active: false });
		expect(updated.builder.update).toHaveBeenCalledWith({ is_active: false });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', BILLABLE_ID);

		const deleted = supabaseMock({ data: [{ id: BILLABLE_ID }] });
		await deleteBillable(deleted.supabase, ORG_ID, BILLABLE_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteBillable(filtered.supabase, ORG_ID, BILLABLE_ID)).rejects.toThrow(
			'Billable was not deleted'
		);
	});
});
