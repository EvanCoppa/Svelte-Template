import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `shipments`, `shipment_line_items` and `shipment_events` —
 * one box against one order, what is inside it, and the carrier's scans (the
 * orders_and_shipments migration).
 *
 * **A shipment belongs to exactly one order**, and `order_id` is insert-only:
 * moving a packed box to another order would restate the fulfillment of both,
 * so repacking is an unpack and a new shipment.
 *
 * **A packing row has no quantity** (the migration's decision 1). A line is in
 * the box or it is not, and shipping four of ten cases is a SPLIT of the order
 * line — `splitOrderLine()` in orders.ts. A unique index enforces one line, one
 * box, so `packLine()` fails rather than giving "where is my item" two answers.
 * Nothing on a packing row is editable either: change it by unpacking and
 * packing again, which is also what makes the carrier half restate both
 * shipments' lines correctly.
 *
 * **`delivery_status` is the one write that moves the order.**
 * `apply_shipment_status_to_lines()` pushes it onto every line in the box —
 * but only onto lines still in play, so `cancelled` and `returned`, which a
 * person decided, survive a scan arriving afterwards. `preparing`,
 * `cancelled`, `failed`, `return_to_sender` and `unknown` say nothing about
 * whether the customer has the goods and move nothing.
 *
 * **Events are append-only**: `shipment_events` has a select and an insert
 * policy and deliberately no update or delete. What a carrier reported is a
 * record of something that happened; the MAPPED status lives on the shipment
 * and this is the raw record of what was actually said.
 *
 * Same contract as invoices.ts otherwise: request-scoped client + active org
 * id, write params Picked to the granted columns, deletes gated to
 * owner/admin by RLS and verified by `unwrapDeleted`.
 */

export type Shipment = Tables<'shipments'>;
export type ShipmentEvent = Tables<'shipment_events'>;

/** The order a box is against, and the party it is for — for list screens. */
type ShippedOrder = Pick<Tables<'orders'>, 'id' | 'number'> | null;
type Supplier = Pick<Tables<'companies'>, 'id' | 'name'> | null;

export type ShipmentWithOrder = Shipment & { orders: ShippedOrder; companies: Supplier };

/** A packed line, read with the order line it names. */
export type PackedLine = Tables<'shipment_line_items'> & {
	order_line_items: Tables<'order_line_items'>;
};

/** A shipment with everything on it, for the record page. */
export type ShipmentWithDetails = ShipmentWithOrder & {
	shipment_line_items: PackedLine[];
	shipment_events: ShipmentEvent[];
};

const CONTEXT = 'orders(id, number), companies(id, name)';

/** The columns a human types or a tracking sync writes. `order_id` is insert-only. */
type ShipmentColumn =
	| 'supplier_id'
	| 'carrier'
	| 'tracking_number'
	| 'tracking_url'
	| 'delivery_status'
	| 'ship_date'
	| 'estimated_delivery_date'
	| 'shipped_at'
	| 'delivered_at'
	| 'notes';

/**
 * The org's shipments, newest first. `orderId` is the filter an order's page
 * uses; `movingOnly` is the tracking board — every box that has not arrived
 * and was not called off.
 */
export async function listShipments(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { orderId?: string; movingOnly?: boolean } = {}
): Promise<ShipmentWithOrder[]> {
	let query = supabase
		.from('shipments')
		.select(`*, ${CONTEXT}`)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.orderId) query = query.eq('order_id', filter.orderId);
	if (filter.movingOnly) {
		query = query.not('delivery_status', 'in', '("delivered","cancelled")');
	}
	return unwrap(await query);
}

/**
 * One shipment with what is in it and what the carrier has said. The scans
 * come back newest first — a timeline is read from the top.
 */
export async function getShipment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string
): Promise<ShipmentWithDetails | null> {
	return unwrap(
		await supabase
			.from('shipments')
			.select(`*, ${CONTEXT}, shipment_line_items(*, order_line_items(*)), shipment_events(*)`)
			.eq('org_id', orgId)
			.eq('id', shipmentId)
			.order('occurred_at', { referencedTable: 'shipment_events', ascending: false })
			.maybeSingle()
	);
}

/**
 * A new box against one order. It starts `preparing`, which is the one
 * delivery status that is ours: the box exists in the warehouse before any
 * carrier has heard of it, and nothing about the order moves until it does.
 */
export async function createShipment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string,
	values: Pick<TablesInsert<'shipments'>, ShipmentColumn>
): Promise<Shipment> {
	return unwrap(
		await supabase
			.from('shipments')
			.insert({ ...values, org_id: orgId, order_id: orderId })
			.select()
			.single()
	);
}

/**
 * Changes the box. Writing `delivery_status` is what moves the order: the
 * status is pushed onto every line inside by trigger, leaving alone the ones
 * a person already cancelled or returned.
 */
export async function updateShipment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string,
	values: Pick<TablesUpdate<'shipments'>, ShipmentColumn>
): Promise<Shipment> {
	return unwrap(
		await supabase
			.from('shipments')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', shipmentId)
			.select()
			.single()
	);
}

export async function deleteShipment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('shipments').delete().eq('org_id', orgId).eq('id', shipmentId).select('id'),
		'Shipment'
	);
}

// ---------------------------------------------------------------------------
// What is in the box
// ---------------------------------------------------------------------------

/**
 * The order lines that could still go in a box: this order's, minus the ones
 * already packed into some shipment. Two reads rather than a join, because
 * "packed anywhere" is what the unique index means — a line already in
 * another box is not offered here, instead of being offered and refused.
 */
export async function packableLines(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string
): Promise<Tables<'order_line_items'>[]> {
	const lines = unwrap(
		await supabase
			.from('order_line_items')
			.select('*')
			.eq('org_id', orgId)
			.eq('order_id', orderId)
			.order('sort_order')
	);
	if (lines.length === 0) return [];

	const packed = unwrap(
		await supabase
			.from('shipment_line_items')
			.select('order_line_item_id')
			.eq('org_id', orgId)
			.in(
				'order_line_item_id',
				lines.map((line) => line.id)
			)
	);
	const taken = new Set(packed.map((row) => row.order_line_item_id));
	return lines.filter((line) => !taken.has(line.id));
}

/**
 * Puts one order line in the box. The unique index refuses a line that is
 * already in another shipment — deliberately, since "where is my item" must
 * have one answer — so this throws rather than silently moving it.
 */
export async function packLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string,
	orderLineItemId: string
): Promise<void> {
	unwrap(
		await supabase
			.from('shipment_line_items')
			.insert({ org_id: orgId, shipment_id: shipmentId, order_line_item_id: orderLineItemId })
			.select('shipment_id')
			.single()
	);
}

/** Takes a line back out. This is also how a line is moved to another box. */
export async function unpackLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string,
	orderLineItemId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('shipment_line_items')
			.delete()
			.eq('org_id', orgId)
			.eq('shipment_id', shipmentId)
			.eq('order_line_item_id', orderLineItemId)
			.select('id:order_line_item_id'),
		'Line'
	);
}

// ---------------------------------------------------------------------------
// The carrier's scans
// ---------------------------------------------------------------------------

/**
 * Records one scan. Append-only by policy, so there is no update or delete to
 * pair with this: a scan is a record of something that happened, and a wrong
 * one is corrected by the next scan rather than by rewriting history.
 *
 * The scan does NOT move the shipment: `status` here is the carrier's own
 * words, kept as text, while the mapped `delivery_status` is a column on the
 * shipment that `updateShipment()` writes.
 */
export async function logShipmentEvent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	shipmentId: string,
	values: Pick<
		TablesInsert<'shipment_events'>,
		| 'status'
		| 'status_detail'
		| 'message'
		| 'description'
		| 'source'
		| 'city'
		| 'region'
		| 'country'
		| 'postal_code'
		| 'occurred_at'
	>
): Promise<ShipmentEvent> {
	return unwrap(
		await supabase
			.from('shipment_events')
			.insert({ ...values, org_id: orgId, shipment_id: shipmentId })
			.select()
			.single()
	);
}
