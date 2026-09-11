import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `assets` — the things an org owns, uses, leases or
 * tracks: a laptop, a truck, a compressor, a dental chair. The table holds
 * only what every asset has (the assets migration says why); who owns or
 * holds one is a relationship (relationships.ts), and a serial number or a
 * VIN is a custom field on it.
 *
 * Same contract as products.ts: request-scoped client + active org id,
 * write params Picked to the columns the migration grants, `created_by`
 * filled by the database, deletes gated to owner/admin by RLS and verified
 * by `unwrapDeleted`.
 */

export type Asset = Tables<'assets'>;

type AssetColumn =
	| 'name'
	| 'asset_type'
	| 'identifier'
	| 'status'
	| 'description'
	| 'acquired_on'
	| 'disposed_on'
	| 'purchase_price'
	| 'currency';

/** The org's assets, in service first, by name — the list page's order. */
export async function listAssets(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { status?: Asset['status'] } = {}
): Promise<Asset[]> {
	let query = supabase.from('assets').select('*').eq('org_id', orgId).order('status').order('name');
	if (filter.status) query = query.eq('status', filter.status);
	return unwrap(await query);
}

export async function getAsset(
	supabase: SupabaseClient<Database>,
	orgId: string,
	assetId: string
): Promise<Asset | null> {
	return unwrap(
		await supabase.from('assets').select('*').eq('org_id', orgId).eq('id', assetId).maybeSingle()
	);
}

export async function createAsset(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'assets'>, AssetColumn>
): Promise<Asset> {
	return unwrap(
		await supabase
			.from('assets')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateAsset(
	supabase: SupabaseClient<Database>,
	orgId: string,
	assetId: string,
	values: Pick<TablesUpdate<'assets'>, AssetColumn>
): Promise<Asset> {
	return unwrap(
		await supabase
			.from('assets')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', assetId)
			.select()
			.single()
	);
}

export async function deleteAsset(
	supabase: SupabaseClient<Database>,
	orgId: string,
	assetId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('assets').delete().eq('org_id', orgId).eq('id', assetId).select('id'),
		'Asset'
	);
}
