import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { Payment } from './payments';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `invoices` and `invoice_line_items` — one bill sent to one
 * customer, and what it bills for (the invoicing migration; the ledger
 * migration made the customer a party). Same contract as companies.ts:
 * request-scoped client + active org id, write params Picked to the columns
 * the migration grants, `created_by` filled by the database, deletes gated
 * to owner/admin by RLS and verified by `unwrapDeleted`.
 *
 * The header's money is the database's: `subtotal` and `tax` roll up from
 * the lines, `amount_paid` and `payment_status` from the payments, `total`
 * and `balance_due` are generated — none of them is writable here, and a
 * caller wanting a figure reads the row back. Issuing freezes the lines by
 * trigger, so a line write on anything but a draft throws the trigger's
 * message; the page keeps the buttons off an issued invoice, and the throw
 * is the backstop.
 */

export type Invoice = Tables<'invoices'>;
export type InvoiceLineItem = Tables<'invoice_line_items'>;

/** A party as an invoice names it: the company billed, the person billed, or both. */
type Party = Pick<Tables<'companies'>, 'id' | 'name'> | null;

/** An invoice with its customer, for list screens and the ledger. */
export type InvoiceWithParties = Invoice & { companies: Party; contacts: Party };

/** An invoice with everything on it, for the record page. */
export type InvoiceWithDetails = InvoiceWithParties & {
	invoice_line_items: InvoiceLineItem[];
	payments: Payment[];
};

const PARTIES = 'companies(id, name), contacts(id, name)';

/** The header columns a human types; the lifecycle ones go through `issueInvoice()` / `voidInvoice()`. */
type InvoiceColumn =
	| 'company_id'
	| 'contact_id'
	| 'order_id'
	| 'currency'
	| 'shipping'
	| 'discount'
	| 'payment_terms_days'
	| 'due_date'
	| 'billing_email'
	| 'memo'
	| 'notes';

type LineColumn =
	| 'product_id'
	| 'description'
	| 'product_sku_snapshot'
	| 'quantity'
	| 'unit_price'
	| 'discount'
	| 'tax'
	| 'sort_order';

/**
 * The org's invoices with their customers, newest first. `companyId` and
 * `contactId` are the party filters a record page uses; `outstandingOnly`
 * is the aging question — issued, and still owed.
 */
export async function listInvoices(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; contactId?: string; outstandingOnly?: boolean } = {}
): Promise<InvoiceWithParties[]> {
	let query = supabase
		.from('invoices')
		.select(`*, ${PARTIES}`)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.outstandingOnly) query = query.eq('status', 'issued').gt('balance_due', 0);
	return unwrap(await query);
}

export async function getInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string
): Promise<InvoiceWithDetails | null> {
	return unwrap(
		await supabase
			.from('invoices')
			.select(`*, ${PARTIES}, invoice_line_items(*), payments(*)`)
			.eq('org_id', orgId)
			.eq('id', invoiceId)
			.order('sort_order', { referencedTable: 'invoice_line_items' })
			.order('received_at', { referencedTable: 'payments', ascending: false })
			.maybeSingle()
	);
}

/** A new draft. The number comes from the database; nothing is owed until it is issued. */
export async function createInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'invoices'>, InvoiceColumn>
): Promise<Invoice> {
	return unwrap(
		await supabase
			.from('invoices')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	values: Pick<TablesUpdate<'invoices'>, InvoiceColumn>
): Promise<Invoice> {
	return unwrap(
		await supabase
			.from('invoices')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', invoiceId)
			.select()
			.single()
	);
}

/**
 * Send it: the draft becomes a claim on the customer's money, its lines
 * close, and it appears on the ledger. `dueDate` is the caller's — the
 * date already on the draft, or `dueDateFor()` in `$lib/crm/ledger` from
 * the terms — and the write is refused for anything but a draft, so a
 * double post cannot re-date an issued bill.
 */
export async function issueInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	{ issuedAt, dueDate }: { issuedAt: string; dueDate: string | null }
): Promise<Invoice> {
	return unwrap(
		await supabase
			.from('invoices')
			.update({ status: 'issued', issued_at: issuedAt, due_date: dueDate })
			.eq('org_id', orgId)
			.eq('id', invoiceId)
			.eq('status', 'draft')
			.select()
			.single()
	);
}

/**
 * Withdraw it. The money that had been applied to it is not withdrawn: the
 * `invoices_void_detaches_payments` trigger puts each payment back on the
 * customer's account, unapplied, so the ledger still shows it arrived and
 * someone can put it against the reissued bill. One guarded write, so a
 * double post or a void of a draft is refused rather than half-done.
 */
export async function voidInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	voidedAt: string
): Promise<Invoice> {
	return unwrap(
		await supabase
			.from('invoices')
			.update({ status: 'void', voided_at: voidedAt })
			.eq('org_id', orgId)
			.eq('id', invoiceId)
			.eq('status', 'issued')
			.select()
			.single()
	);
}

/**
 * Only a draft is deleted; an issued invoice is voided, so the record keeps
 * it. RLS keeps deletes to owner/admin and the status filter keeps the
 * document trail whole, and both are reported the same way.
 */
export async function deleteInvoice(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('invoices')
			.delete()
			.eq('org_id', orgId)
			.eq('id', invoiceId)
			.eq('status', 'draft')
			.select('id'),
		'Invoice'
	);
}

export async function addInvoiceLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	values: Pick<TablesInsert<'invoice_line_items'>, LineColumn>
): Promise<InvoiceLineItem> {
	return unwrap(
		await supabase
			.from('invoice_line_items')
			.insert({ ...values, org_id: orgId, invoice_id: invoiceId })
			.select()
			.single()
	);
}

/** A line is edited through its invoice, so a stale form cannot reach a line on another one. */
export async function updateInvoiceLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	lineId: string,
	values: Pick<TablesUpdate<'invoice_line_items'>, LineColumn>
): Promise<InvoiceLineItem> {
	return unwrap(
		await supabase
			.from('invoice_line_items')
			.update(values)
			.eq('org_id', orgId)
			.eq('invoice_id', invoiceId)
			.eq('id', lineId)
			.select()
			.single()
	);
}

/** Lines are member-writable while the invoice is a draft; the trigger refuses the rest. */
export async function removeInvoiceLine(
	supabase: SupabaseClient<Database>,
	orgId: string,
	invoiceId: string,
	lineId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('invoice_line_items')
			.delete()
			.eq('org_id', orgId)
			.eq('invoice_id', invoiceId)
			.eq('id', lineId)
			.select('id'),
		'Line'
	);
}
