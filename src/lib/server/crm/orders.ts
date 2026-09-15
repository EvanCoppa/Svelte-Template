import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `orders` and `order_line_items` — what one customer asked
 * for, and each thing they asked for (the orders_and_shipments migration).
 *
 * **Most of an order is the database's.** `number` is assigned by trigger
 * (`SO-00001`, the invoices rule), `subtotal` and `tax` roll up from the
 * lines, `total`, `net_amount` and `line_total` are generated, and
 * `fulfillment_status` is folded from the lines by
 * `refresh_order_fulfillment()`. None of them is writable here.
 *
 * **Two status axes, and only one of them is a person's.** `orders.status` is
 * the lifecycle a human moves — draft → confirmed, or cancelled — so it is
 * the two acts below. `fulfillment_status` is DERIVED and never written:
 * a line moving (a person marking it backordered, or a carrier scan landing
 * on a shipment that carries it) is what moves the header. How much has been
 * PAID is a third axis and not a column at all — it is a fact about the
 * order's invoices, read through them.
 *
 * **A partial shipment is a line SPLIT, not a quantity somewhere else**
 * (the migration's decision 1). `splitOrderLine()` is that act: it halves the
 * original and inserts the remainder carrying the same snapshots, so every
 * downstream reference — a packing row, an invoice line, a return — points at
 * one row that means exactly one thing.
 *
 * Lines freeze once an order is cancelled (`check_order_lines_editable`),
 * which is the trigger's message rather than a check here.
 *
 * Same contract as invoices.ts otherwise: request-scoped client + active org
 * id, write params Picked to the granted columns, deletes gated to
 * owner/admin by RLS and verified by `unwrapDeleted`.
 */

export type Order = Tables<'orders'>;
export type OrderLineItem = Tables<'order_line_items'>;

/** The party an order belongs to — both nullable sides of the party model. */
type Customer = Pick<Tables<'companies'>, 'id' | 'name'> | null;
type Buyer = Pick<Tables<'contacts'>, 'id' | 'name'> | null;

/** An order with the party it is for, for list screens. */
export type OrderWithCustomer = Order & { companies: Customer; contacts: Buyer };

/** An order with everything on it, for the record page. */
export type OrderWithDetails = OrderWithCustomer & { order_line_items: OrderLineItem[] };

const PARTY = 'companies(id, name), contacts(id, name)';

/** The header columns a human types; the derived ones are the trigger's. */
type OrderColumn =
	| 'company_id'
	| 'contact_id'
	| 'currency'
	| 'shipping'
	| 'discount'
	| 'customer_po'
	| 'estimated_ship_date'
	| 'notes';

type LineColumn =
	| 'product_id'
	| 'supplier_id'
	| 'description'
	| 'product_sku_snapshot'
	| 'quantity'
	| 'unit_price'
	| 'discount'
	| 'tax'
	| 'fulfillment_status'
	| 'sort_order';

/**
 * The org's orders with their party, newest first. `companyId` is the filter
 * a company's record page uses; `openOnly` is the fulfillment queue —
 * confirmed and not yet fully shipped.
 */
export async function listOrders(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; openOnly?: boolean } = {}
): Promise<OrderWithCustomer[]> {
	let query = supabase
		.from('orders')
		.select(`*, ${PARTY}`)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.openOnly) {
		query = query.eq('status', 'confirmed').in('fulfillment_status', ['unfulfilled', 'partial']);
	}
	return unwrap(await query);
}

export async function getOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string
): Promise<OrderWithDetails | null> {
	return unwrap(
		await supabase
			.from('orders')
			.select(`*, ${PARTY}, order_line_items(*)`)
			.eq('org_id', orgId)
			.eq('id', orderId)
			.order('sort_order', { referencedTable: 'order_line_items' })
			.maybeSingle()
	);
}

/**
 * A new draft. The number is the database's, and nothing is committed to
 * until it is confirmed.
 */
export async function createOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'orders'>, OrderColumn>
): Promise<Order> {
	return unwrap(
		await supabase
			.from('orders')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string,
	values: Pick<TablesUpdate<'orders'>, OrderColumn>
): Promise<Order> {
	return unwrap(
		await supabase
			.from('orders')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', orderId)
			.select()
			.single()
	);
}

export async function deleteOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('orders').delete().eq('org_id', orgId).eq('id', orderId).select('id'),
		'Order'
	);
}

// ---------------------------------------------------------------------------
// The two acts
// ---------------------------------------------------------------------------

/**
 * Confirms the order: `draft` → `confirmed`, stamping when. From here it is
 * a commitment to the customer, but it stays EDITABLE on purpose — goods have
 * not moved, and a customer adding a case before it ships is the normal case
 * (the migration's note on `check_order_lines_editable`).
 *
 * Scoped to a draft, so a second click cannot re-stamp an order already
 * confirmed; `unwrapDeleted`'s reasoning with the status as the guard.
 */
export async function confirmOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string
): Promise<Order> {
	const now = new Date().toISOString();
	const confirmed = unwrap(
		await supabase
			.from('orders')
			.update({ status: 'confirmed', confirmed_at: now, placed_at: now })
			.eq('org_id', orgId)
			.eq('id', orderId)
			.eq('status', 'draft')
			.select()
	);
	const order = confirmed[0];
	if (!order) {
		throw new Error('Order was not confirmed: it is not a draft, or you are not allowed to.');
	}
	return order;
}

/**
 * Cancels the order. Its lines freeze from here — the table's own trigger
 * refuses a change afterwards — so it is the one status an order cannot come
 * back from, and the page asks before it.
 */
export async function cancelOrder(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string
): Promise<Order> {
	const cancelled = unwrap(
		await supabase
			.from('orders')
			.update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
			.eq('org_id', orgId)
			.eq('id', orderId)
			.neq('status', 'cancelled')
			.select()
	);
	const order = cancelled[0];
	if (!order) {
		throw new Error('Order was not cancelled: it already is, or you are not allowed to.');
	}
	return order;
}

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

export async function addOrderLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	orderId: string,
	values: Pick<TablesInsert<'order_line_items'>, LineColumn>
): Promise<OrderLineItem> {
	return unwrap(
		await supabase
			.from('order_line_items')
			.insert({ ...values, org_id: orgId, order_id: orderId })
			.select()
			.single()
	);
}

/**
 * Changes one line — including marking it backordered, cancelled or returned.
 * The header's `fulfillment_status` follows by trigger, which is why there is
 * no "fulfil order" function to pair with `confirmOrder()`.
 */
export async function updateOrderLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	lineId: string,
	values: Pick<TablesUpdate<'order_line_items'>, LineColumn>
): Promise<OrderLineItem> {
	return unwrap(
		await supabase
			.from('order_line_items')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', lineId)
			.select()
			.single()
	);
}

export async function deleteOrderLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	lineId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('order_line_items')
			.delete()
			.eq('org_id', orgId)
			.eq('id', lineId)
			.select('id'),
		'Line'
	);
}

/**
 * Splits a line in two: the original keeps `quantity`, a new line carries the
 * remainder. This is how a partial shipment is expressed — a shipment line
 * has no quantity, so four of ten cases going out is a four-line and a
 * six-line, not a number recorded elsewhere (the migration's decision 1).
 *
 * The remainder copies the original's snapshots — the same product, the same
 * description, the same price — because it is the same thing the customer
 * asked for, only not in this box. It starts `pending`: whatever the original
 * became, the part left behind has not shipped.
 *
 * Two writes rather than one, so a `quantity` the line cannot give up is
 * refused before anything is inserted.
 */
export async function splitOrderLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	lineId: string,
	quantity: number
): Promise<{ line: OrderLineItem; remainder: OrderLineItem }> {
	const line = unwrap(
		await supabase
			.from('order_line_items')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', lineId)
			.maybeSingle()
	);
	if (!line) throw new Error('Line was not split: it does not exist, or you are not allowed to.');
	if (quantity <= 0 || quantity >= line.quantity) {
		throw new Error(`Split off less than the line's ${line.quantity}, and more than nothing.`);
	}

	const remainder = await addOrderLine(supabase, orgId, line.order_id, {
		product_id: line.product_id,
		supplier_id: line.supplier_id,
		description: line.description,
		product_sku_snapshot: line.product_sku_snapshot,
		quantity: line.quantity - quantity,
		unit_price: line.unit_price,
		// Money on the line is per-line, not per-unit, so it stays with the
		// part that keeps the original row rather than being halved by a rule
		// nobody asked for. The remainder is priced by quantity alone.
		discount: 0,
		tax: 0,
		fulfillment_status: 'pending',
		sort_order: line.sort_order
	});

	return { line: await updateOrderLine(supabase, orgId, lineId, { quantity }), remainder };
}

/** An order line with the order it is on — what a product's page lists under Orders. */
export type ProductOrderLine = OrderLineItem & {
	orders: Pick<
		Order,
		'id' | 'number' | 'status' | 'fulfillment_status' | 'created_at' | 'confirmed_at' | 'currency'
	> & { companies: Customer; contacts: Buyer };
};

/**
 * Every order line that cites one product, newest order first — the rows a
 * product's page folds into its sales figures (`salesSummary()` in
 * `$lib/crm/products`) and its allocated stock, and lists under Orders.
 * `product_id` is provenance, so a line whose product was later deleted is
 * simply not here; a line typed in without picking a product never was.
 */
export async function listOrderLinesForProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string
): Promise<ProductOrderLine[]> {
	return unwrap(
		await supabase
			.from('order_line_items')
			.select(
				`*, orders!inner(id, number, status, fulfillment_status, created_at, confirmed_at, currency, ${PARTY})`
			)
			.eq('org_id', orgId)
			.eq('product_id', productId)
			.order('created_at', { ascending: false })
	);
}
