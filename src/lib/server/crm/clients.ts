import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `clients` and `client_contacts`.
 *
 * Every function takes the request-scoped client (`locals.supabase`) so RLS
 * decides visibility, and the active org id (`locals.activeOrgId`) so queries
 * stay filtered to the org the user is looking at — the same contract as the
 * (app) layout load. Write params are Picked down to exactly the columns the
 * migration's grants let the browser role write (see the crm_core migration,
 * "Column-level grants"), so a forbidden column is a type error here instead
 * of a 42501 at runtime; `created_by` is filled by the database.
 *
 * RLS gates deletes to owner/admin — gate the button on `activeOrg.role` for
 * UX, and expect `unwrapDeleted` to throw if a non-manager reaches it anyway.
 */

export type Client = Tables<'clients'>;
export type ClientContact = Tables<'client_contacts'>;

/** A client with its people, for detail screens. */
export type ClientWithContacts = Client & { client_contacts: ClientContact[] };

type ClientColumn = 'name' | 'email' | 'phone' | 'company' | 'website' | 'status';
type ContactColumn = 'client_id' | 'name' | 'email' | 'phone' | 'title' | 'is_primary';

export async function listClients(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<Client[]> {
	return unwrap(await supabase.from('clients').select('*').eq('org_id', orgId).order('name'));
}

export async function getClient(
	supabase: SupabaseClient<Database>,
	orgId: string,
	clientId: string
): Promise<ClientWithContacts | null> {
	return unwrap(
		await supabase
			.from('clients')
			.select('*, client_contacts(*)')
			.eq('org_id', orgId)
			.eq('id', clientId)
			.maybeSingle()
	);
}

export async function createClient(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'clients'>, ClientColumn>
): Promise<Client> {
	return unwrap(
		await supabase
			.from('clients')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateClient(
	supabase: SupabaseClient<Database>,
	orgId: string,
	clientId: string,
	values: Pick<TablesUpdate<'clients'>, ClientColumn>
): Promise<Client> {
	return unwrap(
		await supabase
			.from('clients')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', clientId)
			.select()
			.single()
	);
}

export async function deleteClient(
	supabase: SupabaseClient<Database>,
	orgId: string,
	clientId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('clients').delete().eq('org_id', orgId).eq('id', clientId).select('id'),
		'Client'
	);
}

export async function createContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'client_contacts'>, ContactColumn>
): Promise<ClientContact> {
	return unwrap(
		await supabase
			.from('client_contacts')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	contactId: string,
	values: Pick<TablesUpdate<'client_contacts'>, ContactColumn>
): Promise<ClientContact> {
	return unwrap(
		await supabase
			.from('client_contacts')
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
		await supabase
			.from('client_contacts')
			.delete()
			.eq('org_id', orgId)
			.eq('id', contactId)
			.select('id'),
		'Contact'
	);
}
