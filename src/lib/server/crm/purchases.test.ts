import { describe, expect, it } from 'vitest';
import {
	addPurchaseLine,
	cancelPurchase,
	createPurchase,
	deletePurchase,
	deletePurchaseLine,
	getPurchase,
	listPurchases,
	placePurchase,
	updatePurchase,
	updatePurchaseLine
} from './purchases';
import { ORG_ID, supabaseMock } from './test-support';

const PURCHASE_ID = 'd1000000-0000-0000-0000-000000000001';
const LINE_ID = 'd2000000-0000-0000-0000-000000000001';
const VENDOR_ID = '20000000-0000-0000-0000-000000000003';

describe('purchases data access', () => {
	it('lists the org’s purchases with their vendor, newest first', async () => {
		const rows = [{ id: PURCHASE_ID, number: 'PO-00001' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listPurchases(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('purchases');
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('filters by vendor, and to the orders still coming in', async () => {
		const byVendor = supabaseMock({ data: [] });
		await listPurchases(byVendor.supabase, ORG_ID, { companyId: VENDOR_ID });
		expect(byVendor.builder.eq).toHaveBeenCalledWith('company_id', VENDOR_ID);

		// Placed and not yet fully in — `received` and `cancelled` are the ends.
		const open = supabaseMock({ data: [] });
		await listPurchases(open.supabase, ORG_ID, { openOnly: true });
		expect(open.builder.in).toHaveBeenCalledWith('status', ['ordered', 'partially_received']);
	});

	it('reads one purchase with its lines in order', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getPurchase(supabase, ORG_ID, PURCHASE_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name), purchase_line_items(*)');
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'purchase_line_items'
		});
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a draft without naming a number or a subtotal — both are the database’s', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: PURCHASE_ID } });

		await createPurchase(supabase, ORG_ID, {
			company_id: VENDOR_ID,
			reference: 'Spring restock',
			currency: 'USD',
			freight: 0,
			distribution_fee: 0,
			distribution_fee_pct: null,
			tax: 0,
			expected_at: null,
			due_date: null,
			notes: null
		});
		const [insert] = builder.insert.mock.calls[0];
		expect(insert).toMatchObject({ company_id: VENDOR_ID, org_id: ORG_ID });
		expect(insert).not.toHaveProperty('number');
		expect(insert).not.toHaveProperty('subtotal');
		expect(insert).not.toHaveProperty('status');
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: PURCHASE_ID } });
		await updatePurchase(updated.supabase, ORG_ID, PURCHASE_ID, { reference: 'Q3 restock' });
		expect(updated.builder.update).toHaveBeenCalledWith({ reference: 'Q3 restock' });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);

		const deleted = supabaseMock({ data: [{ id: PURCHASE_ID }] });
		await deletePurchase(deleted.supabase, ORG_ID, PURCHASE_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deletePurchase(filtered.supabase, ORG_ID, PURCHASE_ID)).rejects.toThrow(
			'Purchase was not deleted'
		);
	});
});

describe('the two acts', () => {
	it('places a draft, stamping when it went out', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: PURCHASE_ID, status: 'ordered' }] });

		await placePurchase(supabase, ORG_ID, PURCHASE_ID);
		const [update] = builder.update.mock.calls[0];
		expect(update.status).toBe('ordered');
		expect(update.ordered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		// Scoped to a draft, so a second click cannot re-stamp an order already out.
		expect(builder.eq).toHaveBeenCalledWith('status', 'draft');
	});

	it('refuses to place one that is not a draft, rather than reporting success over nothing', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(placePurchase(supabase, ORG_ID, PURCHASE_ID)).rejects.toThrow(
			'was not placed: it is not a draft'
		);
	});

	it('cancels, and refuses a second cancel', async () => {
		const { supabase, builder } = supabaseMock({
			data: [{ id: PURCHASE_ID, status: 'cancelled' }]
		});
		await cancelPurchase(supabase, ORG_ID, PURCHASE_ID);
		expect(builder.update).toHaveBeenCalledWith({ status: 'cancelled' });
		expect(builder.neq).toHaveBeenCalledWith('status', 'cancelled');

		const already = supabaseMock({ data: [] });
		await expect(cancelPurchase(already.supabase, ORG_ID, PURCHASE_ID)).rejects.toThrow(
			'was not cancelled: it already is'
		);
	});
});

describe('the lines', () => {
	it('adds a line under its purchase and its org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: LINE_ID } });

		await addPurchaseLine(supabase, ORG_ID, PURCHASE_ID, {
			description: 'Nitrile gloves, box of 100',
			quantity_ordered: 24,
			quantity_received: 0,
			unit_cost: 8.5,
			product_id: null,
			product_sku_snapshot: 'GLV-100',
			freight_allocation: 0,
			sort_order: 0
		});
		expect(from).toHaveBeenCalledWith('purchase_line_items');
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ org_id: ORG_ID, purchase_id: PURCHASE_ID })
		);
	});

	it('receives stock as a line write — the header’s status follows by trigger', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: LINE_ID } });

		await updatePurchaseLine(supabase, ORG_ID, LINE_ID, { quantity_received: 24 });
		expect(builder.update).toHaveBeenCalledWith({ quantity_received: 24 });
		expect(builder.eq).toHaveBeenCalledWith('id', LINE_ID);
		// Nothing here touches `purchases.status`: refresh_purchase_rollups()
		// owns it between `ordered` and `received`.
	});

	it('deletes a line with evidence', async () => {
		const deleted = supabaseMock({ data: [{ id: LINE_ID }] });
		await deletePurchaseLine(deleted.supabase, ORG_ID, LINE_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deletePurchaseLine(filtered.supabase, ORG_ID, LINE_ID)).rejects.toThrow(
			'Line was not deleted'
		);
	});
});
