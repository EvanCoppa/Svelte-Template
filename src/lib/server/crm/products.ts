import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `products` and `product_categories` — one catalog holding
 * both goods and services (`kind`), because a dental procedure, a roofing
 * labor line and a stocked part all end up as a priced line on a proposal.
 *
 * Same contract as companies.ts. Inventory columns only mean anything for a
 * good; the migration's check constraint enforces that, so a service with
 * `track_inventory` set is a database error rather than a silent nonsense row.
 */

export type Product = Tables<'products'>;
export type ProductCategory = Tables<'product_categories'>;
export type ProductKind = Enums<'product_kind'>;

/** A product with the category it is filed under, for list screens. */
export type ProductWithCategory = Product & {
	product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
};

type ProductColumn =
	| 'category_id'
	| 'kind'
	| 'sku'
	| 'name'
	| 'description'
	| 'unit_price'
	| 'unit_cost'
	| 'currency'
	| 'unit'
	| 'is_active'
	| 'track_inventory'
	| 'quantity_on_hand';

export async function listProducts(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { kind?: ProductKind; categoryId?: string; activeOnly?: boolean } = {}
): Promise<ProductWithCategory[]> {
	let query = supabase
		.from('products')
		.select('*, product_categories(id, name)')
		.eq('org_id', orgId)
		.order('name');
	if (filter.kind) query = query.eq('kind', filter.kind);
	if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
	if (filter.activeOnly) query = query.eq('is_active', true);
	return unwrap(await query);
}

export async function getProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string
): Promise<ProductWithCategory | null> {
	return unwrap(
		await supabase
			.from('products')
			.select('*, product_categories(id, name)')
			.eq('org_id', orgId)
			.eq('id', productId)
			.maybeSingle()
	);
}

export async function createProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'products'>, ProductColumn>
): Promise<Product> {
	return unwrap(
		await supabase
			.from('products')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string,
	values: Pick<TablesUpdate<'products'>, ProductColumn>
): Promise<Product> {
	return unwrap(
		await supabase
			.from('products')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', productId)
			.select()
			.single()
	);
}

export async function deleteProduct(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('products').delete().eq('org_id', orgId).eq('id', productId).select('id'),
		'Product'
	);
}

export async function listProductCategories(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<ProductCategory[]> {
	return unwrap(
		await supabase
			.from('product_categories')
			.select('*')
			.eq('org_id', orgId)
			.order('sort_order')
			.order('name')
	);
}
