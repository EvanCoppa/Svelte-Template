import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { ensure, unwrap } from './unwrap';

/**
 * Data access for `deals` (the sales pipeline). Same contract as clients.ts:
 * request-scoped client + active org id, generated row types, created_by
 * filled by the database.
 */

export type Deal = Tables<'deals'>;
export type DealStage = Enums<'deal_stage'>;

/** A deal with the client name it belongs to, for pipeline/list screens. */
export type DealWithClient = Deal & { clients: Pick<Tables<'clients'>, 'id' | 'name'> };

export async function listDeals(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { clientId?: string; stage?: DealStage } = {}
): Promise<DealWithClient[]> {
	let query = supabase
		.from('deals')
		.select('*, clients(id, name)')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.clientId) query = query.eq('client_id', filter.clientId);
	if (filter.stage) query = query.eq('stage', filter.stage);
	return unwrap(await query);
}

export async function getDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string
): Promise<DealWithClient | null> {
	return unwrap(
		await supabase
			.from('deals')
			.select('*, clients(id, name)')
			.eq('org_id', orgId)
			.eq('id', dealId)
			.maybeSingle()
	);
}

export async function createDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Omit<TablesInsert<'deals'>, 'org_id' | 'created_by'>
): Promise<Deal> {
	return unwrap(
		await supabase
			.from('deals')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string,
	values: TablesUpdate<'deals'>
): Promise<Deal> {
	return unwrap(
		await supabase
			.from('deals')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', dealId)
			.select()
			.single()
	);
}

export async function deleteDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string
): Promise<void> {
	ensure(await supabase.from('deals').delete().eq('org_id', orgId).eq('id', dealId));
}
