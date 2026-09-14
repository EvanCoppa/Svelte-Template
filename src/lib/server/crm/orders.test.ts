import { describe, expect, it } from 'vitest';
import {
	addOrderLine,
	cancelOrder,
	confirmOrder,
	createOrder,
	deleteOrder,
	deleteOrderLine,
	getOrder,
	listOrders,
	splitOrderLine,
	updateOrder,
	updateOrderLine
} from './orders';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

const ORDER_ID = 'e1000000-0000-0000-0000-000000000001';
const LINE_ID = 'e2000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = '20000000-0000-0000-0000-000000000001';

describe('orders data access', () => {
	it('lists the org’s orders with their party, newest first', async () => {
		const rows = [{ id: ORDER_ID, number: 'SO-00001' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listOrders(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('orders');
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name), contacts(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('filters by customer, and to the orders still owed to someone', async () => {
		const byCustomer = supabaseMock({ data: [] });
		await listOrders(byCustomer.supabase, ORG_ID, { companyId: CUSTOMER_ID });
		expect(byCustomer.builder.eq).toHaveBeenCalledWith('company_id', CUSTOMER_ID);

		// The fulfillment queue is both axes: committed to, and not all out.
		const open = supabaseMock({ data: [] });
		await listOrders(open.supabase, ORG_ID, { openOnly: true });
		expect(open.builder.eq).toHaveBeenCalledWith('status', 'confirmed');
		expect(open.builder.in).toHaveBeenCalledWith('fulfillment_status', ['unfulfilled', 'partial']);
	});

	it('reads one order with its lines in order', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getOrder(supabase, ORG_ID, ORDER_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith(
			'*, companies(id, name), contacts(id, name), order_line_items(*)'
		);
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'order_line_items'
		});
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a draft without naming a number, a total or a fulfillment — all three are the database’s', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ORDER_ID } });

		await createOrder(supabase, ORG_ID, {
			company_id: CUSTOMER_ID,
			contact_id: null,
			currency: 'USD',
			shipping: 0,
			discount: 0,
			customer_po: 'PO-4471',
			estimated_ship_date: null,
			notes: null
		});
		const [insert] = builder.insert.mock.calls[0];
		expect(insert).toMatchObject({ company_id: CUSTOMER_ID, org_id: ORG_ID });
		expect(insert).not.toHaveProperty('number');
		expect(insert).not.toHaveProperty('subtotal');
		expect(insert).not.toHaveProperty('fulfillment_status');
		expect(insert).not.toHaveProperty('status');
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: ORDER_ID } });
		await updateOrder(updated.supabase, ORG_ID, ORDER_ID, { customer_po: 'PO-9' });
		expect(updated.builder.update).toHaveBeenCalledWith({ customer_po: 'PO-9' });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);

		const deleted = supabaseMock({ data: [{ id: ORDER_ID }] });
		await deleteOrder(deleted.supabase, ORG_ID, ORDER_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteOrder(filtered.supabase, ORG_ID, ORDER_ID)).rejects.toThrow(
			'Order was not deleted'
		);
	});
});

describe('the two acts', () => {
	it('confirms a draft, stamping when it was committed to', async () => {
		const { supabase, builder } = supabaseMock({
			data: [{ id: ORDER_ID, status: 'confirmed' }]
		});

		await confirmOrder(supabase, ORG_ID, ORDER_ID);
		const [update] = builder.update.mock.calls[0];
		expect(update.status).toBe('confirmed');
		expect(update.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		// Scoped to a draft, so a second click cannot re-stamp one already out.
		expect(builder.eq).toHaveBeenCalledWith('status', 'draft');
	});

	it('refuses to confirm one that is not a draft, rather than reporting success over nothing', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(confirmOrder(supabase, ORG_ID, ORDER_ID)).rejects.toThrow(
			'was not confirmed: it is not a draft'
		);
	});

	it('cancels, and refuses a second cancel', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: ORDER_ID, status: 'cancelled' }] });
		await cancelOrder(supabase, ORG_ID, ORDER_ID);
		expect(builder.update.mock.calls[0][0].status).toBe('cancelled');
		expect(builder.neq).toHaveBeenCalledWith('status', 'cancelled');

		const already = supabaseMock({ data: [] });
		await expect(cancelOrder(already.supabase, ORG_ID, ORDER_ID)).rejects.toThrow(
			'was not cancelled: it already is'
		);
	});
});

describe('the lines', () => {
	it('adds a line under its order and its org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: LINE_ID } });

		await addOrderLine(supabase, ORG_ID, ORDER_ID, {
			description: 'Nitrile gloves, box of 100',
			product_id: null,
			supplier_id: null,
			product_sku_snapshot: 'GLV-100',
			quantity: 10,
			unit_price: 12.5,
			discount: 0,
			tax: 0,
			fulfillment_status: 'pending',
			sort_order: 0
		});
		expect(from).toHaveBeenCalledWith('order_line_items');
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ org_id: ORG_ID, order_id: ORDER_ID })
		);
	});

	it('marks a line backordered as a line write — the header’s fulfillment follows by trigger', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: LINE_ID } });

		await updateOrderLine(supabase, ORG_ID, LINE_ID, { fulfillment_status: 'backordered' });
		expect(builder.update).toHaveBeenCalledWith({ fulfillment_status: 'backordered' });
		expect(builder.eq).toHaveBeenCalledWith('id', LINE_ID);
	});

	it('deletes a line with evidence', async () => {
		const deleted = supabaseMock({ data: [{ id: LINE_ID }] });
		await deleteOrderLine(deleted.supabase, ORG_ID, LINE_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteOrderLine(filtered.supabase, ORG_ID, LINE_ID)).rejects.toThrow(
			'Line was not deleted'
		);
	});
});

describe('splitting a line', () => {
	const line = {
		id: LINE_ID,
		order_id: ORDER_ID,
		product_id: null,
		supplier_id: null,
		description: 'Nitrile gloves, box of 100',
		product_sku_snapshot: 'GLV-100',
		quantity: 10,
		unit_price: 12.5,
		discount: 5,
		tax: 2,
		sort_order: 0
	};

	it('leaves the shipped quantity on the original and carries the rest to a new pending line', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: line },
			{ data: { ...line, id: 'e2000000-0000-0000-0000-000000000002', quantity: 6 } },
			{ data: { ...line, quantity: 4 } }
		]);

		const { remainder } = await splitOrderLine(supabase, ORG_ID, LINE_ID, 4);

		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				description: line.description,
				product_sku_snapshot: 'GLV-100',
				quantity: 6,
				unit_price: 12.5,
				fulfillment_status: 'pending',
				// The line's own money stays with the original row rather than
				// being halved by a rule nobody asked for.
				discount: 0,
				tax: 0
			})
		);
		expect(remainder.quantity).toBe(6);
		expect(builder.update).toHaveBeenCalledWith({ quantity: 4 });
	});

	it('refuses a split that takes all of the line, or none of it, before inserting anything', async () => {
		for (const quantity of [0, 10, 11, -1]) {
			const { supabase, builder } = supabaseMockSequence([{ data: line }]);
			await expect(splitOrderLine(supabase, ORG_ID, LINE_ID, quantity)).rejects.toThrow(
				"Split off less than the line's 10"
			);
			expect(builder.insert).not.toHaveBeenCalled();
		}
	});

	it('refuses a line the reader cannot see', async () => {
		const { supabase } = supabaseMockSequence([{ data: null }]);
		await expect(splitOrderLine(supabase, ORG_ID, LINE_ID, 4)).rejects.toThrow(
			'Line was not split'
		);
	});
});
