import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { Product } from './products';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `featured_groups` — the named, ordered sets of products an
 * org puts in front of a buyer together (the featured_groups migration). A
 * group is its row plus the join rows naming its products in order; the two
 * are always read and written together, because a group with no members is
 * not a group.
 *
 * Same contract as quick-plans.ts, whose shape this copies exactly.
 * Replacing a group's members is a delete and an insert: the join rows carry
 * nothing but order, so there is nothing to edit in place, and PostgREST
 * offers no transaction across the two — a refusal between them leaves the
 * group empty, which the page reports.
 */

export type FeaturedGroup = Tables<'featured_groups'>;

/** What the groups page needs of a member: enough to name and price it. */
export type FeaturedGroupProduct = Pick<
	Product,
	'id' | 'sku' | 'name' | 'unit_price' | 'currency' | 'unit' | 'image_url' | 'is_active'
>;

export type FeaturedGroupWithProducts = FeaturedGroup & {
	featured_group_products: { sort_order: number; products: FeaturedGroupProduct }[];
};

const SELECT =
	'*, featured_group_products(sort_order, products(id, sku, name, unit_price, currency, unit, image_url, is_active))';

type FeaturedGroupColumn = 'name' | 'description' | 'is_active' | 'sort_order';

export async function listFeaturedGroups(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<FeaturedGroupWithProducts[]> {
	return unwrap(
		await supabase
			.from('featured_groups')
			.select(SELECT)
			.eq('org_id', orgId)
			.order('sort_order')
			.order('name')
			.order('sort_order', { referencedTable: 'featured_group_products' })
	);
}

export async function createFeaturedGroup(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'featured_groups'>, FeaturedGroupColumn>,
	productIds: readonly string[]
): Promise<FeaturedGroup> {
	const group = unwrap(
		await supabase
			.from('featured_groups')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
	await setMembers(supabase, orgId, group.id, productIds);
	return group;
}

export async function updateFeaturedGroup(
	supabase: SupabaseClient<Database>,
	orgId: string,
	featuredGroupId: string,
	values: Pick<TablesUpdate<'featured_groups'>, FeaturedGroupColumn>,
	productIds: readonly string[]
): Promise<FeaturedGroup> {
	const group = unwrap(
		await supabase
			.from('featured_groups')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', featuredGroupId)
			.select()
			.single()
	);
	ensure(
		await supabase
			.from('featured_group_products')
			.delete()
			.eq('org_id', orgId)
			.eq('featured_group_id', featuredGroupId)
	);
	await setMembers(supabase, orgId, featuredGroupId, productIds);
	return group;
}

export async function deleteFeaturedGroup(
	supabase: SupabaseClient<Database>,
	orgId: string,
	featuredGroupId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('featured_groups')
			.delete()
			.eq('org_id', orgId)
			.eq('id', featuredGroupId)
			.select('id'),
		'Featured group'
	);
}

/** The group's members, in the order given — one insert for all of them. */
async function setMembers(
	supabase: SupabaseClient<Database>,
	orgId: string,
	featuredGroupId: string,
	productIds: readonly string[]
): Promise<void> {
	if (productIds.length === 0) return;
	ensure(
		await supabase.from('featured_group_products').insert(
			productIds.map((product_id, index) => ({
				org_id: orgId,
				featured_group_id: featuredGroupId,
				product_id,
				sort_order: index
			}))
		)
	);
}
