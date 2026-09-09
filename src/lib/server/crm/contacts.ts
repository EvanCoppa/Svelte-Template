import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `contacts` — every person the org knows, whether or not they
 * work somewhere. `company_id` is nullable on purpose: a patient, a homeowner
 * and a sole trader are contacts with no company, and the same list, search and
 * proposal recipient picker serves them and the buyer at a 500-person account.
 *
 * Same contract as companies.ts: request-scoped client, active org id, write
 * params Picked to the granted columns, `created_by` filled by the database,
 * deletes gated to owner/admin by RLS and verified by `unwrapDeleted`.
 */

export type Contact = Tables<'contacts'>;

/** A contact with the company they belong to, for list screens. */
export type ContactWithCompany = Contact & {
	companies: Pick<Tables<'companies'>, 'id' | 'name'> | null;
};

type ContactColumn =
	'company_id' | 'name' | 'email' | 'phone' | 'title' | 'dob' | 'is_primary' | 'status';

export async function listContacts(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; unattachedOnly?: boolean } = {}
): Promise<ContactWithCompany[]> {
	let query = supabase
		.from('contacts')
		.select('*, companies(id, name)')
		.eq('org_id', orgId)
		.order('name');
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.unattachedOnly) query = query.is('company_id', null);
	return unwrap(await query);
}

export async function getContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	contactId: string
): Promise<ContactWithCompany | null> {
	return unwrap(
		await supabase
			.from('contacts')
			.select('*, companies(id, name)')
			.eq('org_id', orgId)
			.eq('id', contactId)
			.maybeSingle()
	);
}

export async function createContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'contacts'>, ContactColumn>
): Promise<Contact> {
	return unwrap(
		await supabase
			.from('contacts')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	contactId: string,
	values: Pick<TablesUpdate<'contacts'>, ContactColumn>
): Promise<Contact> {
	return unwrap(
		await supabase
			.from('contacts')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', contactId)
			.select()
			.single()
	);
}

export async function deleteContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	contactId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('contacts').delete().eq('org_id', orgId).eq('id', contactId).select('id'),
		'Contact'
	);
}
