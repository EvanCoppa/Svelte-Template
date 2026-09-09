import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CompanyOwnCondition, ViewSort } from '$lib/views/filter';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `companies` — the organizations an org deals with, whichever
 * side of the business they sit on (`relationship`: customer, supplier,
 * partner). People live in contacts.ts; a company is never a person here, and
 * a person with no employer is a contact with a null `company_id` rather than
 * a one-person company.
 *
 * Every function takes the request-scoped client (`locals.supabase`) so RLS
 * decides visibility, and the active org id (`locals.activeOrgId`) so queries
 * stay filtered to the org the user is looking at — the same contract as the
 * (app) layout load. Write params are Picked down to exactly the columns the
 * migration's grants let the browser role write (see the party-model
 * migration, "Column-level grants"), so a forbidden column is a type error
 * here instead of a 42501 at runtime; `created_by` is filled by the database.
 *
 * RLS gates deletes to owner/admin — gate the button on `activeOrg.role` for
 * UX, and expect `unwrapDeleted` to throw if a non-manager reaches it anyway.
 */

export type Company = Tables<'companies'>;

/** A company with its people, for detail screens. */
export type CompanyWithContacts = Company & { contacts: Tables<'contacts'>[] };

type CompanyColumn = 'name' | 'email' | 'phone' | 'website' | 'status' | 'relationship';

/**
 * The org's companies, by name. `relationship` is the one-off filter the
 * companies page and the assistant's search use; `conditions`, `ids` and
 * `sort` are how a view's filter compiles (`$lib/views/filter`) — its own
 * columns applied here, the conditions that need another table first
 * (a tag) arriving as an id list from `runView()`.
 */
export async function listCompanies(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: {
		relationship?: Company['relationship'];
		ids?: readonly string[];
		conditions?: readonly CompanyOwnCondition[];
		sort?: ViewSort;
	} = {}
): Promise<Company[]> {
	let query = supabase.from('companies').select('*').eq('org_id', orgId);
	if (filter.relationship) query = query.eq('relationship', filter.relationship);
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
		}
	}
	query = filter.sort
		? query.order(filter.sort.field, { ascending: filter.sort.direction === 'asc' })
		: query.order('name');
	return unwrap(await query);
}

export async function getCompany(
	supabase: SupabaseClient<Database>,
	orgId: string,
	companyId: string
): Promise<CompanyWithContacts | null> {
	return unwrap(
		await supabase
			.from('companies')
			.select('*, contacts(*)')
			.eq('org_id', orgId)
			.eq('id', companyId)
			.maybeSingle()
	);
}

export async function createCompany(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'companies'>, CompanyColumn>
): Promise<Company> {
	return unwrap(
		await supabase
			.from('companies')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateCompany(
	supabase: SupabaseClient<Database>,
	orgId: string,
	companyId: string,
	values: Pick<TablesUpdate<'companies'>, CompanyColumn>
): Promise<Company> {
	return unwrap(
		await supabase
			.from('companies')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', companyId)
			.select()
			.single()
	);
}

export async function deleteCompany(
	supabase: SupabaseClient<Database>,
	orgId: string,
	companyId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('companies').delete().eq('org_id', orgId).eq('id', companyId).select('id'),
		'Company'
	);
}
