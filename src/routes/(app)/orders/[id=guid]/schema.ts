import { z } from 'zod';
import { LINE_FULFILLMENT_STATUSES } from '$lib/crm/orders';
import { quantityField as quantity } from '$lib/schemas/fields';

/**
 * An order's own forms: its lines, where each of them stands, splitting one,
 * and the two acts.
 *
 * The lines are not the generic record form's job — a line belongs to a
 * document rather than being a record of its own, the way an invoice's lines
 * are kept by `billing.server.ts` beside the record page. The header IS the
 * generic form's (`orderRecordSchema`), reached through `EditRecord`.
 *
 * `product_id` is PROVENANCE, not a live lookup — the products rule. A line
 * keeps its own description, SKU snapshot and unit price, so repricing the
 * catalog never rewrites an order that was already confirmed.
 */

const amount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 8.50');

export const orderLineSchema = z.object({
	product_id: z.guid().or(z.literal('')).default(''),
	/** The vendor filling THIS line — blank means the org's own stock, or not yet assigned. */
	supplier_id: z.guid().or(z.literal('')).default(''),
	description: z
		.string()
		.trim()
		.min(1, 'Say what the line is for.')
		.max(500, 'Keep it under 500 characters.'),
	product_sku_snapshot: z
		.string()
		.trim()
		.max(120, 'Keep the SKU under 120 characters.')
		.default(''),
	quantity,
	unit_price: amount.default(''),
	discount: amount.default(''),
	tax: amount.default('')
});

/** Editing a line is the same shape plus which one. */
export const updateOrderLineSchema = orderLineSchema.extend({ id: z.guid() });

export const removeOrderLineSchema = z.object({ id: z.guid() });

/**
 * Where one line stands. A person writes `pending`, `processing`,
 * `backordered`, `cancelled` or `returned`; `shipped` and `delivered` are the
 * carrier's, written when a scan lands on the shipment carrying the line, so
 * they are not offered here — setting one by hand would claim a box moved.
 */
export const setLineStatusSchema = z.object({
	id: z.guid(),
	fulfillment_status: z.enum(LINE_FULFILLMENT_STATUSES)
});

/**
 * Splitting a line. This is how a partial shipment is expressed: a shipment
 * line has no quantity, so four of ten cases going out is a four-line and a
 * six-line (the orders_and_shipments migration's decision 1). How much the
 * ORIGINAL keeps is what is typed; the rest becomes a new pending line.
 */
export const splitOrderLineSchema = z.object({
	id: z.guid(),
	quantity
});

/** The two acts carry no fields — the order is the one in the URL. */
export const orderActSchema = z.object({});

/** A blank picker is no row — the line stands on its own description. */
export function pickOf(value: string): string | null {
	return value === '' ? null : value;
}

/** A blank amount is zero: every money column on a line is not-null. */
export function amountOf(value: string): number {
	return value === '' ? 0 : Number(value);
}
