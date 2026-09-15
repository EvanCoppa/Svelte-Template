import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `purchases` and `purchase_line_items` — what the org buys
 * from a vendor, and what is on the order (the vendors_and_purchasing
 * migration).
 *
 * **Most of a purchase is the database's, not a caller's.** `number` is
 * assigned by trigger (`PO-00001`, the invoices rule), `subtotal` is rolled
 * up from the lines, `total`, `line_total` and `landed_unit_cost` are
 * generated, and `received_at` is stamped when the last line arrives. None of
 * them is writable here; a caller that wants a figure reads the row back.
 *
 * **The status moves two ways, and only one of them is an act.** Placing the
 * order (`draft` → `ordered`) and cancelling it are human decisions, so they
 * are functions below. Everything between — `ordered` → `partially_received`
 * → `received` — is DERIVED by `refresh_purchase_rollups()` from how much of
 * each line has arrived, so receiving is a line write and the header follows.
 * Never set those three by hand: the trigger would overwrite it on the next
 * line change, and the two would disagree in the meantime.
 *
 * Lines are frozen once a purchase is cancelled (`check_purchase_lines_
 * editable`), which is the trigger's message, not a check here.
 *
 * Same contract as invoices.ts otherwise: request-scoped client + active org
 * id, write params Picked to the granted columns, deletes gated to
 * owner/admin by RLS and verified by `unwrapDeleted`.
 */

export type Purchase = Tables<'purchases'>;
export type PurchaseLineItem = Tables<'purchase_line_items'>;

/** The vendor a purchase is placed with — a company, by the party model. */
type Vendor = Pick<Tables<'companies'>, 'id' | 'name'> | null;

/** A purchase with the vendor it is placed with, for list screens. */
export type PurchaseWithVendor = Purchase & { companies: Vendor };

/** A purchase with everything on it, for the record page. */
export type PurchaseWithDetails = PurchaseWithVendor & {
	purchase_line_items: PurchaseLineItem[];
};

const VENDOR = 'companies(id, name)';

/** The header columns a human types; the derived ones are the trigger's. */
type PurchaseColumn =
	| 'company_id'
	| 'reference'
	| 'currency'
	| 'freight'
	| 'distribution_fee_pct'
	| 'distribution_fee'
	| 'tax'
	| 'expected_at'
	| 'due_date'
	| 'notes';

type LineColumn =
	| 'product_id'
	| 'description'
	| 'product_sku_snapshot'
	| 'quantity_ordered'
	| 'quantity_received'
	| 'unit_cost'
	| 'freight_allocation'
	| 'sort_order';

/**
 * The org's purchases with their vendors, newest first. `companyId` is the
 * vendor filter a company's record page uses; `openOnly` is the buying
 * queue — placed and not yet fully in.
 */
export async function listPurchases(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; openOnly?: boolean } = {}
): Promise<PurchaseWithVendor[]> {
	let query = supabase
		.from('purchases')
		.select(`*, ${VENDOR}`)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.openOnly) query = query.in('status', ['ordered', 'partially_received']);
	return unwrap(await query);
}

export async function getPurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string
): Promise<PurchaseWithDetails | null> {
	return unwrap(
		await supabase
			.from('purchases')
			.select(`*, ${VENDOR}, purchase_line_items(*)`)
			.eq('org_id', orgId)
			.eq('id', purchaseId)
			.order('sort_order', { referencedTable: 'purchase_line_items' })
			.maybeSingle()
	);
}

/** A new draft. The number is the database's; nothing is ordered until it is placed. */
export async function createPurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'purchases'>, PurchaseColumn>
): Promise<Purchase> {
	return unwrap(
		await supabase
			.from('purchases')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updatePurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string,
	values: Pick<TablesUpdate<'purchases'>, PurchaseColumn>
): Promise<Purchase> {
	return unwrap(
		await supabase
			.from('purchases')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', purchaseId)
			.select()
			.single()
	);
}

export async function deletePurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('purchases').delete().eq('org_id', orgId).eq('id', purchaseId).select('id'),
		'Purchase'
	);
}

// ---------------------------------------------------------------------------
// The two acts
// ---------------------------------------------------------------------------

/**
 * Places the order: `draft` → `ordered`, stamping when it went out. From here
 * the rollup trigger owns the status — the next line receipt moves it to
 * `partially_received` or `received` on its own.
 *
 * Scoped to a draft, so a second click cannot re-stamp an order that is
 * already out; `unwrapDeleted`'s reasoning, with the status as the guard.
 */
export async function placePurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string
): Promise<Purchase> {
	const placed = unwrap(
		await supabase
			.from('purchases')
			.update({ status: 'ordered', ordered_at: new Date().toISOString() })
			.eq('org_id', orgId)
			.eq('id', purchaseId)
			.eq('status', 'draft')
			.select()
	);
	const purchase = placed[0];
	if (!purchase) {
		throw new Error('Purchase was not placed: it is not a draft, or you are not allowed to.');
	}
	return purchase;
}

/**
 * Cancels the order. Its lines freeze from here — the table's own trigger
 * refuses a change to them afterwards — so this is the one status a purchase
 * cannot come back from, and the page asks before it.
 */
export async function cancelPurchase(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string
): Promise<Purchase> {
	const cancelled = unwrap(
		await supabase
			.from('purchases')
			.update({ status: 'cancelled' })
			.eq('org_id', orgId)
			.eq('id', purchaseId)
			.neq('status', 'cancelled')
			.select()
	);
	const purchase = cancelled[0];
	if (!purchase) {
		throw new Error('Purchase was not cancelled: it already is, or you are not allowed to.');
	}
	return purchase;
}

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

export async function addPurchaseLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	purchaseId: string,
	values: Pick<TablesInsert<'purchase_line_items'>, LineColumn>
): Promise<PurchaseLineItem> {
	return unwrap(
		await supabase
			.from('purchase_line_items')
			.insert({ ...values, org_id: orgId, purchase_id: purchaseId })
			.select()
			.single()
	);
}

/**
 * Changes one line. Receiving stock is this write — `quantity_received` — and
 * the header's status follows by trigger, which is why there is no
 * "receive purchase" function to pair with `placePurchase()`.
 */
export async function updatePurchaseLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	lineId: string,
	values: Pick<TablesUpdate<'purchase_line_items'>, LineColumn>
): Promise<PurchaseLineItem> {
	return unwrap(
		await supabase
			.from('purchase_line_items')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', lineId)
			.select()
			.single()
	);
}

export async function deletePurchaseLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	lineId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('purchase_line_items')
			.delete()
			.eq('org_id', orgId)
			.eq('id', lineId)
			.select('id'),
		'Line'
	);
}

/** A purchase line with the purchase it is on — what a product's page lists under Purchases. */
export type ProductPurchaseLine = PurchaseLineItem & {
	purchases: Pick<
		Purchase,
		'id' | 'number' | 'status' | 'created_at' | 'ordered_at' | 'currency'
	> & {
		companies: Vendor;
	};
};

/**
 * Every purchase line that cites one product, newest purchase first — who the
 * org buys it from and what it paid, as the product's page lists them.
 */
export async function listPurchaseLinesForProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string
): Promise<ProductPurchaseLine[]> {
	return unwrap(
		await supabase
			.from('purchase_line_items')
			.select(`*, purchases!inner(id, number, status, created_at, ordered_at, currency, ${VENDOR})`)
			.eq('org_id', orgId)
			.eq('product_id', productId)
			.order('created_at', { ascending: false })
	);
}
