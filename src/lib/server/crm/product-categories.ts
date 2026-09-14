import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `product_categories` — the tree an org browses its catalog
 * by (the product_catalog migration).
 *
 * A category is a NODE, not a record: it has no `crm_entity_type` value, so
 * nothing tags, notes or relates to one and it has no generic record page. It
 * is reference data the org shapes — the `pipelines` and `quick_plans` shape —
 * which is why writes are owner/admin by RLS rather than member-writable like
 * the products filed under it.
 *
 * **The whole tree is one read.** PostgREST cannot embed a self-referencing
 * composite foreign key (`parent_id, org_id`), so a parent and its children
 * are not fetched as embeds; `listProductCategories()` returns every node with
 * its product count and `$lib/crm/categories.ts` nests them. That is the
 * better shape regardless: a tree drawn node by node is a query per node.
 *
 * Two facts the table enforces that callers must not re-implement: deleting a
 * category deletes its SUBTREE (the self-referencing cascade), and a category
 * cannot become its own ancestor (a trigger walks the parents). The products
 * filed in a deleted subtree are kept and left uncategorised —
 * `products.category_id` is `on delete set null`.
 */

export type ProductCategory = Tables<'product_categories'>;

/**
 * A category with the number of products filed DIRECTLY in it. How many sit
 * under its whole subtree is a question about the tree, which the pure fold
 * answers once the nodes are nested.
 */
export type ProductCategoryWithCount = ProductCategory & { products: { count: number }[] };

type ProductCategoryColumn = 'name' | 'description' | 'parent_id' | 'sort_order';

/**
 * Every category the org has, in sibling order — the one read behind both the
 * tree page and a single category's page.
 */
export async function listProductCategories(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<ProductCategoryWithCount[]> {
	return unwrap(
		await supabase
			.from('product_categories')
			.select('*, products(count)')
			.eq('org_id', orgId)
			.order('sort_order')
			.order('name')
	);
}

export async function getProductCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	categoryId: string
): Promise<ProductCategory | null> {
	return unwrap(
		await supabase
			.from('product_categories')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', categoryId)
			.maybeSingle()
	);
}

export async function createProductCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'product_categories'>, ProductCategoryColumn>
): Promise<ProductCategory> {
	return unwrap(
		await supabase
			.from('product_categories')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateProductCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	categoryId: string,
	values: Pick<TablesUpdate<'product_categories'>, ProductCategoryColumn>
): Promise<ProductCategory> {
	return unwrap(
		await supabase
			.from('product_categories')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', categoryId)
			.select()
			.single()
	);
}

/**
 * Removes the category and everything under it — the cascade is the table's,
 * so the page says so before it asks.
 */
export async function deleteProductCategory(
	supabase: SupabaseClient<Database>,
	orgId: string,
	categoryId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('product_categories')
			.delete()
			.eq('org_id', orgId)
			.eq('id', categoryId)
			.select('id'),
		'Category'
	);
}
