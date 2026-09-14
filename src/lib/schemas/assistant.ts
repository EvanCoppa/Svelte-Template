import { z } from 'zod';
import { instantField, quantityField } from './fields';

/**
 * The assistant page's forms. Two are the sidebar's row menu's (rename,
 * delete) and two are an artifact's — a slot picked on the pick-a-time card,
 * a box packed on the packing card — all posted to the assistant page's
 * actions, which is why they live here rather than beside the route. Ids are
 * `z.guid()` rather than `z.uuid()` for the reason the staff schema gives: a
 * Postgres uuid is any 8-4-4-4-12 value, and the seed's fixed ids do not
 * carry RFC 4122 version bits.
 */

export const renameConversationSchema = z.object({
	conversation_id: z.guid(),
	title: z
		.string()
		.trim()
		.min(1, 'Give the conversation a name.')
		.max(80, 'Keep the name under 80 characters.')
});

export const deleteConversationSchema = z.object({
	conversation_id: z.guid()
});

/**
 * A slot picked on the pick-a-time card: the title the assistant was asked
 * to find time for and the two instants of the slot — the calendar's own
 * booking, without the fields a slot has already decided (it is timed, not
 * all-day; it is for nobody in particular until the calendar says so).
 */
export const bookSlotSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1, 'Give the event a title.')
			.max(200, 'Keep the title under 200 characters.'),
		starts_at: instantField,
		ends_at: instantField
	})
	.refine((data) => Date.parse(data.ends_at) > Date.parse(data.starts_at), {
		error: 'The event has to end after it starts.',
		path: ['ends_at']
	});

/**
 * A box packed on the packing card: the order and the lines going in it,
 * each with the quantity that ships — the line's whole quantity, or less,
 * which splits it first (`splitOrderLine()`, the order page's rule for a
 * partial shipment). Posted as one document (`dataType: 'json'`), because
 * the lines are an array.
 */
export const packOrderSchema = z.object({
	order_id: z.guid(),
	lines: z
		.array(z.object({ id: z.guid(), quantity: quantityField }))
		.min(1, 'Tick at least one line to pack.')
});

/** What the `pack` action answers with on success, beside the form: the box it opened. */
export const packResultSchema = z.object({ shipmentId: z.guid() });
