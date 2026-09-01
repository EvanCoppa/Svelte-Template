import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { ensure, unwrap } from './unwrap';

/**
 * Data access for `clients` and `client_contacts`.
 *
 * Every function takes the request-scoped client (`locals.supabase`) so RLS
 * decides visibility, and the active org id (`locals.activeOrgId`) so queries
 * stay filtered to the org the user is looking at — the same contract as the
 * (app) layout load. Row shapes come from the generated types; `created_by`
 * is filled by the database (defaults to the caller), never passed in.
 */

export type Client = Tables<'clients'>;
export type ClientContact = Tables<'client_contacts'>;

/** A client with its people, for detail screens. */
export type ClientWithContacts = Client & { client_contacts: ClientContact[] };

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
	values: Omit<TablesInsert<'clients'>, 'org_id' | 'created_by'>
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
	values: TablesUpdate<'clients'>
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
	ensure(await supabase.from('clients').delete().eq('org_id', orgId).eq('id', clientId));
}

export async function createContact(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Omit<TablesInsert<'client_contacts'>, 'org_id'>
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
	values: TablesUpdate<'client_contacts'>
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
	ensure(await supabase.from('client_contacts').delete().eq('org_id', orgId).eq('id', contactId));
}
