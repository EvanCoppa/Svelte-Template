import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `coupons` — the discounts an org publishes: a code, what it
 * takes off, and the window it is good for (the coupons migration). Nothing
 * applies a coupon yet, so there is no redemption to count and no basket to
 * scope one to; that migration says why both are absent rather than present
 * and unenforced.
 *
 * Same contract as assets.ts: request-scoped client + active org id, write
 * params Picked to the columns the migration grants, `created_by` filled by
 * the database, deletes gated to owner/admin by RLS and verified by
 * `unwrapDeleted`.
 */

export type Coupon = Tables<'coupons'>;

type CouponColumn =
	| 'code'
	| 'description'
	| 'discount_type'
	| 'discount_value'
	| 'currency'
	| 'starts_on'
	| 'ends_on'
	| 'is_active';

/** The org's coupons, live ones first, by code — the list page's order. */
export async function listCoupons(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { activeOnly?: boolean } = {}
): Promise<Coupon[]> {
	let query = supabase
		.from('coupons')
		.select('*')
		.eq('org_id', orgId)
		.order('is_active', { ascending: false })
		.order('code');
	if (filter.activeOnly) query = query.eq('is_active', true);
	return unwrap(await query);
}

export async function getCoupon(
	supabase: SupabaseClient<Database>,
	orgId: string,
	couponId: string
): Promise<Coupon | null> {
	return unwrap(
		await supabase.from('coupons').select('*').eq('org_id', orgId).eq('id', couponId).maybeSingle()
	);
}

export async function createCoupon(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'coupons'>, CouponColumn>
): Promise<Coupon> {
	return unwrap(
		await supabase
			.from('coupons')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateCoupon(
	supabase: SupabaseClient<Database>,
	orgId: string,
	couponId: string,
	values: Pick<TablesUpdate<'coupons'>, CouponColumn>
): Promise<Coupon> {
	return unwrap(
		await supabase
			.from('coupons')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', couponId)
			.select()
			.single()
	);
}

export async function deleteCoupon(
	supabase: SupabaseClient<Database>,
	orgId: string,
	couponId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('coupons').delete().eq('org_id', orgId).eq('id', couponId).select('id'),
		'Coupon'
	);
}
