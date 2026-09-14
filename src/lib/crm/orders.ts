import type { Enums } from '$lib/database.types';

/**
 * What a page may say about an order, on both sides of the wire.
 *
 * A line's fulfillment has two authors (the orders_and_shipments migration's
 * decision 3): a person moves it between the states below, and the CARRIER
 * writes `shipped` and `delivered` when a scan lands on the shipment carrying
 * the line. So those two are deliberately absent here — offering them would
 * let a form claim a box moved, and the next scan would overwrite it anyway.
 */
export const LINE_FULFILLMENT_STATUSES = [
	'pending',
	'processing',
	'backordered',
	'cancelled',
	'returned'
] as const satisfies readonly Enums<'line_fulfillment_status'>[];

/** Whether a line's state is still a person's to set, or the carrier's now. */
export function isCarrierOwned(status: Enums<'line_fulfillment_status'>): boolean {
	return status === 'shipped' || status === 'delivered';
}
