import type { SupabaseClient } from '@supabase/supabase-js';
import { customerKey, describeLedger, type CanOpen, type LedgerEntry } from '$lib/crm/ledger';
import type { Database } from '$lib/database.types';
import { listInvoices } from './invoices';
import { listPayments } from './payments';

/**
 * The ledger read — the server half of `$lib/crm/ledger`. Two indexed
 * lists, one per table, folded into the rows a statement is made of; the
 * arithmetic lives in the pure module so the page can redo it for a slice.
 * A customer filter narrows both lists the same way, so an account's
 * statement and the org's ledger are one function with one argument.
 */

/** One customer's account, by company or by person; empty for the whole org. */
export type LedgerFilter = { companyId?: string; contactId?: string };

export async function readLedger(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: LedgerFilter,
	canOpen: CanOpen
): Promise<LedgerEntry[]> {
	const [invoices, payments] = await Promise.all([
		listInvoices(supabase, orgId, filter),
		listPayments(supabase, orgId, filter)
	]);
	const entries = describeLedger(invoices, payments, canOpen);
	// A statement is one account's. The contact filter also matches rows that
	// name the person at a company — rows on the company's account — so the
	// fold's own rule decides which rows belong.
	const account = filter.companyId
		? customerKey({ kind: 'company', id: filter.companyId })
		: filter.contactId
			? customerKey({ kind: 'contact', id: filter.contactId })
			: null;
	return account ? entries.filter((entry) => customerKey(entry.customer) === account) : entries;
}
