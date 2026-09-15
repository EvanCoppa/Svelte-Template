import { describe, expect, it } from 'vitest';
import {
	createShipment,
	deleteShipment,
	getShipment,
	listShipments,
	logShipmentEvent,
	packLine,
	packableLines,
	unpackLine,
	updateShipment
} from './shipments';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

const SHIPMENT_ID = 'f1000000-0000-0000-0000-000000000001';
const ORDER_ID = 'e1000000-0000-0000-0000-000000000001';
const LINE_ID = 'e2000000-0000-0000-0000-000000000001';

describe('shipments data access', () => {
	it('lists the org’s boxes with their order and shipper, newest first', async () => {
		const rows = [{ id: SHIPMENT_ID, tracking_number: '1Z999' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listShipments(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('shipments');
		expect(builder.select).toHaveBeenCalledWith('*, orders(id, number), companies(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('filters to one order, and to the tracking board', async () => {
		const byOrder = supabaseMock({ data: [] });
		await listShipments(byOrder.supabase, ORG_ID, { orderId: ORDER_ID });
		expect(byOrder.builder.eq).toHaveBeenCalledWith('order_id', ORDER_ID);

		// Everything that has not arrived and was not called off.
		const moving = supabaseMock({ data: [] });
		await listShipments(moving.supabase, ORG_ID, { movingOnly: true });
		expect(moving.builder.not).toHaveBeenCalledWith(
			'delivery_status',
			'in',
			'("delivered","cancelled")'
		);
	});

	it('reads one box with what is in it and the scans newest first', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getShipment(supabase, ORG_ID, SHIPMENT_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith(
			'*, orders(id, number), companies(id, name), shipment_line_items(*, order_line_items(*)), shipment_events(*)'
		);
		// A timeline is read from the top.
		expect(builder.order).toHaveBeenCalledWith('occurred_at', {
			referencedTable: 'shipment_events',
			ascending: false
		});
	});

	it('opens a box against exactly one order', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: SHIPMENT_ID } });

		await createShipment(supabase, ORG_ID, ORDER_ID, {
			supplier_id: null,
			carrier: null,
			tracking_number: null,
			tracking_url: null,
			delivery_status: 'preparing',
			ship_date: null,
			estimated_delivery_date: null,
			shipped_at: null,
			delivered_at: null,
			notes: null
		});
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ org_id: ORG_ID, order_id: ORDER_ID, delivery_status: 'preparing' })
		);
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: SHIPMENT_ID } });
		await updateShipment(updated.supabase, ORG_ID, SHIPMENT_ID, { delivery_status: 'in_transit' });
		expect(updated.builder.update).toHaveBeenCalledWith({ delivery_status: 'in_transit' });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);

		const deleted = supabaseMock({ data: [{ id: SHIPMENT_ID }] });
		await deleteShipment(deleted.supabase, ORG_ID, SHIPMENT_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteShipment(filtered.supabase, ORG_ID, SHIPMENT_ID)).rejects.toThrow(
			'Shipment was not deleted'
		);
	});
});

describe('what is in the box', () => {
	it('offers the order’s lines that are in no box yet, and nothing else', async () => {
		const lines = [{ id: LINE_ID }, { id: 'e2000000-0000-0000-0000-000000000002' }];
		const { supabase } = supabaseMockSequence([
			{ data: lines },
			// The second is already packed somewhere — one line, one box.
			{ data: [{ order_line_item_id: 'e2000000-0000-0000-0000-000000000002' }] }
		]);

		await expect(packableLines(supabase, ORG_ID, ORDER_ID)).resolves.toEqual([{ id: LINE_ID }]);
	});

	it('does not go looking for packed rows when the order has no lines', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: [] }]);

		await expect(packableLines(supabase, ORG_ID, ORDER_ID)).resolves.toEqual([]);
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('packs a line under its box and its org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { shipment_id: SHIPMENT_ID } });

		await packLine(supabase, ORG_ID, SHIPMENT_ID, LINE_ID);
		expect(from).toHaveBeenCalledWith('shipment_line_items');
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			shipment_id: SHIPMENT_ID,
			order_line_item_id: LINE_ID
		});
	});

	it('unpacks with evidence, so a line that was not in this box is not reported as removed', async () => {
		const removed = supabaseMock({ data: [{ id: LINE_ID }] });
		await unpackLine(removed.supabase, ORG_ID, SHIPMENT_ID, LINE_ID);
		expect(removed.builder.eq).toHaveBeenCalledWith('shipment_id', SHIPMENT_ID);
		expect(removed.builder.eq).toHaveBeenCalledWith('order_line_item_id', LINE_ID);

		const filtered = supabaseMock({ data: [] });
		await expect(unpackLine(filtered.supabase, ORG_ID, SHIPMENT_ID, LINE_ID)).rejects.toThrow(
			'Line was not deleted'
		);
	});
});

describe('the carrier’s scans', () => {
	it('appends one scan against its box, and never writes the mapped status', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: 'scan' } });

		await logShipmentEvent(supabase, ORG_ID, SHIPMENT_ID, {
			message: 'Arrived at facility',
			status: 'in_transit',
			status_detail: null,
			description: null,
			source: 'manual',
			city: 'Gotham',
			region: 'NJ',
			country: null,
			postal_code: null,
			occurred_at: '2026-09-18T10:00:00.000Z'
		});
		expect(from).toHaveBeenCalledWith('shipment_events');
		const [insert] = builder.insert.mock.calls[0];
		expect(insert).toMatchObject({ org_id: ORG_ID, shipment_id: SHIPMENT_ID });
		// `status` here is the carrier's own words; the MAPPED delivery status
		// is a column on the shipment that updateShipment() writes.
		expect(insert).not.toHaveProperty('delivery_status');
	});
});
