import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { ContactOwnCondition, ViewSort } from '$lib/views/filter';
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

type ContactColumn = 'company_id' | 'name' | 'email' | 'phone' | 'title' | 'is_primary' | 'status';

/**
 * The org's people with the company each belongs to, by name. `companyId`
 * and `unattachedOnly` are the one-off filters the pages use; `conditions`,
 * `ids` and `sort` are how a view's filter compiles (`$lib/views/filter`) —
 * the contact's own columns applied here, a hop through another table (the
 * company's relationship, a tag) arriving as an id list from `runView()`.
 */
export async function listContacts(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: {
		companyId?: string;
		unattachedOnly?: boolean;
		ids?: readonly string[];
		conditions?: readonly ContactOwnCondition[];
		sort?: ViewSort;
	} = {}
): Promise<ContactWithCompany[]> {
	let query = supabase.from('contacts').select('*, companies(id, name)').eq('org_id', orgId);
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.unattachedOnly) query = query.is('company_id', null);
	if (filter.ids) query = query.in('id', [...filter.ids]);
	for (const condition of filter.conditions ?? []) {
		switch (condition.op) {
			case 'in':
				query = query.in(condition.field, condition.values);
				break;
			case 'not_in':
				query = query.not(condition.field, 'in', `(${condition.values.join(',')})`);
				break;
			case 'ilike':
				query = query.ilike(condition.field, `%${condition.value}%`);
				break;
			case 'eq':
				query = condition.value
					? query.not('company_id', 'is', null)
					: query.is('company_id', null);
				break;
		}
	}
	query = filter.sort
		? query.order(filter.sort.field, { ascending: filter.sort.direction === 'asc' })
		: query.order('name');
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
