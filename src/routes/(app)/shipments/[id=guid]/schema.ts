import { z } from 'zod';
import { DELIVERY_STATUSES } from '$lib/crm/shipments';
import { optionalInstant } from '$lib/schemas/records';

/**
 * A shipment's own forms: the box itself, what goes in it, and the carrier's
 * scans.
 *
 * None of this is the generic record form's job. A shipment's `order_id` is
 * not null and insert-only, so a box is created on the order it ships; and
 * what is IN it is a set of order lines, which no field type renders.
 */

/** A day, the spelling `optionalDate` uses in the record registry. */
const shipDate = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
	.default('');

export const shipmentSchema = z.object({
	supplier_id: z.guid().or(z.literal('')).default(''),
	carrier: z.string().trim().max(120, 'Keep the carrier under 120 characters.').default(''),
	tracking_number: z
		.string()
		.trim()
		.max(120, 'Keep the tracking number under 120 characters.')
		.default(''),
	tracking_url: z.union([z.url('Enter a link like https://…'), z.literal('')]).default(''),
	ship_date: shipDate,
	estimated_delivery_date: shipDate,
	notes: z.string().trim().max(2000, 'Keep the notes under 2000 characters.').default('')
});

/**
 * Where the carrier last saw it. This is the one write that moves the order:
 * the status is pushed onto every line in the box by trigger, leaving alone
 * the ones a person already cancelled or returned.
 */
export const setDeliveryStatusSchema = z.object({
	delivery_status: z.enum(DELIVERY_STATUSES)
});

/** Putting one order line in the box, and taking it back out. */
export const packLineSchema = z.object({ order_line_item_id: z.guid() });

/**
 * One carrier scan, typed in. Append-only, so there is no edit to pair with
 * it: a wrong scan is corrected by the next one, never by rewriting history.
 */
export const logEventSchema = z.object({
	message: z
		.string()
		.trim()
		.min(1, 'Say what the carrier reported.')
		.max(500, 'Keep it under 500 characters.'),
	status: z.string().trim().max(120, 'Keep the status under 120 characters.').default(''),
	city: z.string().trim().max(120, 'Keep the city under 120 characters.').default(''),
	region: z.string().trim().max(120, 'Keep the region under 120 characters.').default(''),
	// The one shared spelling of "what a date-time input posts" — a second
	// would start rejecting what the first sends. Required here, though:
	// `shipment_events.occurred_at` is not null, because a scan with no time
	// cannot take its place in the timeline.
	occurred_at: optionalInstant.refine((value) => value !== '', 'Say when the carrier reported it.')
});

/** A blank picker is no row — a box the org shipped itself has no supplier. */
export function pickOf(value: string): string | null {
	return value === '' ? null : value;
}

/** A blank text field is null, not an empty string: the columns are nullable. */
export function textOf(value: string): string | null {
	return value === '' ? null : value;
}
