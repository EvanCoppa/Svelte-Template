import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `rmas` — goods coming back from a customer, and how far
 * back they are (the rmas migration). The header only: which units are
 * returning waits for inventory movement, and the credit for them is a
 * `refund` payment on the ledger, never a second copy of an amount here.
 *
 * Same contract as invoices.ts: request-scoped client + active org id, the
 * customer read as a party (both `company_id` and `contact_id` nullable,
 * at least one set), `number` assigned by the database and not writable,
 * deletes gated to owner/admin by RLS and verified by `unwrapDeleted`.
 */

export type Rma = Tables<'rmas'>;

/** A party as a return names it: the company it came from, the person, or both. */
type Party = Pick<Tables<'companies'>, 'id' | 'name'> | null;

/** A return with its customer, for the list page and a party's related records. */
export type RmaWithParties = Rma & { companies: Party; contacts: Party };

const PARTIES = 'companies(id, name), contacts(id, name)';

type RmaColumn = 'company_id' | 'contact_id' | 'status' | 'reason' | 'resolution' | 'requested_on';

/**
 * The org's returns with their customers, newest first. `companyId` and
 * `contactId` are the party filters a record page uses; `openOnly` is the
 * queue question — everything that has not reached an end state.
 */
export async function listRmas(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; contactId?: string; openOnly?: boolean } = {}
): Promise<RmaWithParties[]> {
	let query = supabase
		.from('rmas')
		.select(`*, ${PARTIES}`)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.openOnly) query = query.in('status', ['requested', 'approved', 'received']);
	return unwrap(await query);
}

export async function getRma(
	supabase: SupabaseClient<Database>,
	orgId: string,
	rmaId: string
): Promise<RmaWithParties | null> {
	return unwrap(
		await supabase
			.from('rmas')
			.select(`*, ${PARTIES}`)
			.eq('org_id', orgId)
			.eq('id', rmaId)
			.maybeSingle()
	);
}

/** A new return. The number comes from the database, like an invoice's. */
export async function createRma(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'rmas'>, RmaColumn>
): Promise<Rma> {
	return unwrap(
		await supabase
			.from('rmas')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateRma(
	supabase: SupabaseClient<Database>,
	orgId: string,
	rmaId: string,
	values: Pick<TablesUpdate<'rmas'>, RmaColumn>
): Promise<Rma> {
	return unwrap(
		await supabase.from('rmas').update(values).eq('org_id', orgId).eq('id', rmaId).select().single()
	);
}

export async function deleteRma(
	supabase: SupabaseClient<Database>,
	orgId: string,
	rmaId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('rmas').delete().eq('org_id', orgId).eq('id', rmaId).select('id'),
		'Return'
	);
}
