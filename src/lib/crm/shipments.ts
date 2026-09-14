import type { Enums } from '$lib/database.types';

/**
 * What a page may say about a shipment, on both sides of the wire.
 *
 * Every delivery status the enum has is settable here, unlike an order line's:
 * these ARE the carrier's words, and someone reading a tracking page and
 * typing what it says is exactly how a box moves before live tracking is
 * wired up. `preparing` is the one that is ours — the box exists in the
 * warehouse before any carrier has heard of it.
 *
 * Which of them actually move the lines inside is
 * `apply_shipment_status_to_lines()`'s to say, and `MOVES_THE_ORDER` below
 * mirrors it so the page can warn before it asks.
 */
export const DELIVERY_STATUSES = [
	'preparing',
	'pending',
	'pre_transit',
	'in_transit',
	'out_for_delivery',
	'available_for_pickup',
	'delivered',
	'return_to_sender',
	'failed',
	'cancelled',
	'unknown'
] as const satisfies readonly Enums<'shipment_delivery_status'>[];

/**
 * The statuses that push a line status onto everything in the box —
 * `delivered` makes its lines delivered, the five in transit make them
 * shipped. The rest say nothing about whether the customer has the goods, so
 * they move nothing.
 *
 * A mirror of the trigger, for the page's wording only: the database is what
 * enforces it.
 */
const MOVES_THE_ORDER = new Set<string>([
	'pending',
	'pre_transit',
	'in_transit',
	'out_for_delivery',
	'available_for_pickup',
	'delivered'
]);

export function movesTheOrder(status: Enums<'shipment_delivery_status'>): boolean {
	return MOVES_THE_ORDER.has(status);
}

/** A status as a person reads it: the enum's underscores are not words. */
export function deliveryLabel(status: string): string {
	const words = status.replace(/_/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}
