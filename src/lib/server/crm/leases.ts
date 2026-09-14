import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `leases` — the rent roll. A lease says who rents which
 * property, over what dates, at what rent.
 *
 * **A lease has no status column** (the properties_and_leases migration,
 * decision 2): whether one is upcoming, running or finished is a question
 * about a day, and a day is a wall-clock word. That question lives in
 * `$lib/crm/leases.ts` — client-safe, so the pages answer it with the
 * viewer's own date and nothing on the server decides what "now" means.
 */

export type Lease = Tables<'leases'>;

/** A lease with the property it covers and the tenant on it, as the rent roll reads it. */
export type LeaseWithParties = Lease & {
	properties: Pick<Tables<'properties'>, 'id' | 'name' | 'parent_id'> | null;
	companies: Pick<Tables<'companies'>, 'id' | 'name'> | null;
	contacts: Pick<Tables<'contacts'>, 'id' | 'name'> | null;
};

const WITH_PARTIES =
	'*, properties(id, name, parent_id), companies(id, name), contacts(id, name)' as const;

type LeaseColumn =
	| 'property_id'
	| 'company_id'
	| 'contact_id'
	| 'starts_on'
	| 'ends_on'
	| 'rent_amount'
	| 'rent_due_day'
	| 'security_deposit'
	| 'currency'
	| 'notes';

/**
 * The org's leases, newest term first — the rent roll's order, because the
 * lease someone is asking about is almost always the current one.
 */
export async function listLeases(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { propertyId?: string; contactId?: string; companyId?: string } = {}
): Promise<LeaseWithParties[]> {
	let query = supabase
		.from('leases')
		.select(WITH_PARTIES)
		.eq('org_id', orgId)
		.order('starts_on', { ascending: false });
	if (filter.propertyId) query = query.eq('property_id', filter.propertyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	// Companies rent too — a shop, a corporate let — so the tenant filter has
	// both sides of the party model, like every other table that names one.
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	return unwrap(await query);
}

export async function getLease(
	supabase: SupabaseClient<Database>,
	orgId: string,
	leaseId: string
): Promise<LeaseWithParties | null> {
	return unwrap(
		await supabase
			.from('leases')
			.select(WITH_PARTIES)
			.eq('org_id', orgId)
			.eq('id', leaseId)
			.maybeSingle()
	);
}

export async function createLease(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'leases'>, LeaseColumn>
): Promise<Lease> {
	return unwrap(
		await supabase
			.from('leases')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateLease(
	supabase: SupabaseClient<Database>,
	orgId: string,
	leaseId: string,
	values: Pick<TablesUpdate<'leases'>, LeaseColumn>
): Promise<Lease> {
	return unwrap(
		await supabase
			.from('leases')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', leaseId)
			.select()
			.single()
	);
}

export async function deleteLease(
	supabase: SupabaseClient<Database>,
	orgId: string,
	leaseId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('leases').delete().eq('org_id', orgId).eq('id', leaseId).select('id'),
		'Lease'
	);
}
