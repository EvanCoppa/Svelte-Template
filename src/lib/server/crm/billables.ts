import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `billables` — the fee schedule: what an org charges for
 * on a proposal, as distinct from the products it sells (products.ts). A
 * dental procedure with its CDT code, a roofing labor line, a consultation:
 * each priced per unit, counted in the units the row names (`unit`), either
 * picked from a fixed set (`unit_choices`) or typed in.
 *
 * Same contract as products.ts: request-scoped client + active org id,
 * write params Picked to the columns the migration grants, `created_by`
 * filled by the database, deletes gated to owner/admin by RLS and verified
 * by `unwrapDeleted`.
 */

export type Billable = Tables<'billables'>;

type BillableColumn =
	| 'code'
	| 'name'
	| 'description'
	| 'unit_price'
	| 'currency'
	| 'unit'
	| 'unit_choices'
	| 'is_featured'
	| 'is_active'
	| 'sort_order';

export async function listBillables(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { activeOnly?: boolean; featuredOnly?: boolean } = {}
): Promise<Billable[]> {
	let query = supabase
		.from('billables')
		.select('*')
		.eq('org_id', orgId)
		.order('sort_order')
		.order('name');
	if (filter.activeOnly) query = query.eq('is_active', true);
	if (filter.featuredOnly) query = query.eq('is_featured', true);
	return unwrap(await query);
}

export async function getBillable(
	supabase: SupabaseClient<Database>,
	orgId: string,
	billableId: string
): Promise<Billable | null> {
	return unwrap(
		await supabase
			.from('billables')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', billableId)
			.maybeSingle()
	);
}

export async function createBillable(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'billables'>, BillableColumn>
): Promise<Billable> {
	return unwrap(
		await supabase
			.from('billables')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateBillable(
	supabase: SupabaseClient<Database>,
	orgId: string,
	billableId: string,
	values: Pick<TablesUpdate<'billables'>, BillableColumn>
): Promise<Billable> {
	return unwrap(
		await supabase
			.from('billables')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', billableId)
			.select()
			.single()
	);
}

export async function deleteBillable(
	supabase: SupabaseClient<Database>,
	orgId: string,
	billableId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('billables').delete().eq('org_id', orgId).eq('id', billableId).select('id'),
		'Billable'
	);
}
