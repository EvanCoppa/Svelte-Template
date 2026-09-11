import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `payments` — one sum of money that moved, in or back out
 * (`kind`), optionally against one invoice (the invoicing migration's
 * decision 1: `invoice_id` null is money on the customer's account, not a
 * gap). Same contract as companies.ts: request-scoped client + active org
 * id, write params Picked to the granted columns, `created_by` filled by
 * the database, deletes gated to owner/admin by RLS and verified by
 * `unwrapDeleted`.
 *
 * A payment is never edited in amount or direction here: `kind` is
 * insert-only by grant, and a wrong figure is a delete and a new row, so
 * every invoice it touched is restated by the rollup rather than rewritten
 * in place. The one thing that changes about a payment is what it is
 * applied to — `applyPayment()`.
 */

export type Payment = Tables<'payments'>;

type Party = Pick<Tables<'companies'>, 'id' | 'name'> | null;

/** A payment with its customer and the invoice it settles, for the ledger. */
export type PaymentWithParties = Payment & {
	companies: Party;
	contacts: Party;
	invoices: Pick<Tables<'invoices'>, 'id' | 'number'> | null;
};

const PARTIES = 'companies(id, name), contacts(id, name), invoices(id, number)';

type PaymentColumn =
	| 'company_id'
	| 'contact_id'
	| 'invoice_id'
	| 'kind'
	| 'method'
	| 'amount'
	| 'currency'
	| 'reference'
	| 'received_at'
	| 'idempotency_key'
	| 'notes';

/**
 * The org's payments, newest first, with the invoice each settles. The
 * party filters serve a record page; `unappliedOnly` is the question the
 * invoice page asks of its customer — is there money on account to apply?
 */
export async function listPayments(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; contactId?: string; unappliedOnly?: boolean } = {}
): Promise<PaymentWithParties[]> {
	let query = supabase
		.from('payments')
		.select(`*, ${PARTIES}`)
		.eq('org_id', orgId)
		.order('received_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.unappliedOnly) query = query.is('invoice_id', null);
	return unwrap(await query);
}

export async function getPayment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	paymentId: string
): Promise<Payment | null> {
	return unwrap(
		await supabase
			.from('payments')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', paymentId)
			.maybeSingle()
	);
}

/**
 * Money arrived (or went back). With `invoice_id` the rollup restates that
 * invoice; without it the sum sits on the customer's account. The
 * idempotency key is the form's guard against a double submit creating
 * money that never moved — pass the token minted with the page.
 */
export async function recordPayment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'payments'>, PaymentColumn>
): Promise<Payment> {
	return unwrap(
		await supabase
			.from('payments')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

/**
 * Put a payment against an invoice, or take it off one (`null`). Both sides
 * are restated by the rollup — the invoice it leaves as well as the one it
 * lands on.
 */
export async function applyPayment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	paymentId: string,
	invoiceId: string | null
): Promise<Payment> {
	return unwrap(
		await supabase
			.from('payments')
			.update({ invoice_id: invoiceId })
			.eq('org_id', orgId)
			.eq('id', paymentId)
			.select()
			.single()
	);
}

export async function deletePayment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	paymentId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('payments').delete().eq('org_id', orgId).eq('id', paymentId).select('id'),
		'Payment'
	);
}

/**
 * When the money arrived, from the calendar day a payment form posts. A day
 * picked is read as noon UTC, so it lands on that date in every zone a
 * reader is likely to sit in; a blank one is left to the column's default,
 * which is now.
 */
export function receivedAtFor(day: string): string | undefined {
	return day === '' ? undefined : `${day}T12:00:00.000Z`;
}
