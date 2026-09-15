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
	| 'quantity_on_hand'
	// The storefront half of a catalog row: the body a shop renders, its
	// picture, the compare-at price and the open bag of everything else it
	// shows. Writable through the same generic form as the columns above.
	| 'long_description'
	| 'image_url'
	| 'msrp'
	| 'metadata';

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

const PRODUCT_IMAGE_BUCKET = 'product-images';

/** A product's image object never changes extension after upload. */
function productImageExtension(file: File): string {
	const fromName = file.name.split('.').pop();
	if (fromName && fromName.length <= 5) return fromName.toLowerCase();
	return file.type.split('/').pop() ?? 'bin';
}

function productImagePath(orgId: string, productId: string, file: File): string {
	return `${orgId}/${productId}/${crypto.randomUUID()}.${productImageExtension(file)}`;
}

/** The storage path a product's public image URL points at, or null for a URL typed by hand. */
function productImageStoragePath(url: string): string | null {
	const marker = `/object/public/${PRODUCT_IMAGE_BUCKET}/`;
	const index = url.indexOf(marker);
	return index === -1 ? null : url.slice(index + marker.length);
}

/**
 * Uploads a file to the public `product-images` bucket (provisioned by the
 * product images bucket migration) and points `image_url` at it, replacing
 * whatever was there. The upload is undone if the row write fails, and the
 * object the row pointed at before is removed once the new one is live —
 * the same rollback and no-orphans rule `entity-images.ts` takes, adapted to
 * a single-slot field instead of a gallery row per file.
 */
export async function setProductImage(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string,
	file: File
): Promise<Product> {
	const previous = await getProduct(supabase, orgId, productId);
	if (!previous) throw new Error('Product was not found.');

	const path = productImagePath(orgId, productId, file);
	const uploaded = await supabase.storage
		.from(PRODUCT_IMAGE_BUCKET)
		.upload(path, file, { contentType: file.type });
	if (uploaded.error) throw new Error(uploaded.error.message, { cause: uploaded.error });

	const {
		data: { publicUrl }
	} = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);

	try {
		const updated = await updateProduct(supabase, orgId, productId, { image_url: publicUrl });
		const previousPath = previous.image_url ? productImageStoragePath(previous.image_url) : null;
		if (previousPath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([previousPath]);
		return updated;
	} catch (cause) {
		await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
		throw cause;
	}
}

/** Clears a product's image, removing the storage object it pointed at. */
export async function clearProductImage(
	supabase: SupabaseClient<Database>,
	orgId: string,
	productId: string
): Promise<Product> {
	const previous = await getProduct(supabase, orgId, productId);
	if (!previous) throw new Error('Product was not found.');

	const updated = await updateProduct(supabase, orgId, productId, { image_url: null });
	const previousPath = previous.image_url ? productImageStoragePath(previous.image_url) : null;
	if (previousPath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([previousPath]);
	return updated;
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
