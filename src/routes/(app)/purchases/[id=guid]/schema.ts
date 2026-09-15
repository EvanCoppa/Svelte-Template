import { z } from 'zod';

/**
 * A purchase's own forms: its lines, receiving against them, and the two
 * acts.
 *
 * The lines are not the generic record form's job — a line belongs to a
 * document rather than being a record of its own, the way an invoice's lines
 * are kept by `billing.server.ts` beside the record page. The header IS the
 * generic form's (`purchaseRecordSchema`), reached through `EditRecord`.
 *
 * `product_id` is PROVENANCE, not a live lookup — the products rule. A line
 * keeps its own description, SKU snapshot and unit cost, so repricing the
 * catalog never rewrites an order that was already placed.
 */

const amount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 8.50');

/** A count of things, which may be fractional (a length, a weight). */
const quantity = z
	.string()
	.trim()
	.regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter a quantity like 24 or 2.5');

export const purchaseLineSchema = z.object({
	product_id: z.guid().or(z.literal('')).default(''),
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
	quantity_ordered: quantity,
	unit_cost: amount.default(''),
	freight_allocation: amount.default('')
});

/** Editing a line is the same shape plus which one. */
export const updatePurchaseLineSchema = purchaseLineSchema.extend({ id: z.guid() });

export const removePurchaseLineSchema = z.object({ id: z.guid() });

/**
 * Receiving. This is the only write that moves the header's status, and it
 * does it through the database: `refresh_purchase_rollups()` reads every
 * line's `quantity_received` and sets `ordered` / `partially_received` /
 * `received` itself. Nothing here writes a status.
 */
export const receivePurchaseLineSchema = z.object({
	id: z.guid(),
	quantity_received: quantity
});

/** The two acts carry no fields — the purchase is the one in the URL. */
export const purchaseActSchema = z.object({});

/** A blank picker is no product — the line stands on its own description. */
export function productOf(value: string): string | null {
	return value === '' ? null : value;
}

/** A blank amount is zero: every money column on a line is not-null. */
export function amountOf(value: string): number {
	return value === '' ? 0 : Number(value);
}
