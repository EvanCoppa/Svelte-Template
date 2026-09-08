import { describe, expect, it } from 'vitest';
import {
	createProduct,
	deleteProduct,
	getProduct,
	listProductCategories,
	listProducts,
	updateProduct
} from './products';
import { ORG_ID, supabaseMock } from './test-support';

const PRODUCT_ID = '70000000-0000-0000-0000-000000000001';
const CATEGORY_ID = '71000000-0000-0000-0000-000000000001';

describe('products data access', () => {
	it('lists the catalog with each entry’s category', async () => {
		const rows = [{ id: PRODUCT_ID, name: 'Architectural shingle' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listProducts(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('products');
		expect(builder.select).toHaveBeenCalledWith('*, product_categories(id, name)');
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('filters goods from services, and retired entries out', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listProducts(supabase, ORG_ID, { kind: 'service', activeOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('kind', 'service');
		expect(builder.eq).toHaveBeenCalledWith('is_active', true);
	});

	it('fetches one product, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getProduct(supabase, ORG_ID, PRODUCT_ID)).resolves.toBeNull();
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a service without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: PRODUCT_ID } });

		await createProduct(supabase, ORG_ID, {
			kind: 'service',
			name: 'Roof inspection',
			unit_price: 150,
			unit: 'visit'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			kind: 'service',
			name: 'Roof inspection',
			unit_price: 150,
			unit: 'visit',
			org_id: ORG_ID
		});
	});

	it('updates scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: PRODUCT_ID } });

		await updateProduct(supabase, ORG_ID, PRODUCT_ID, { category_id: CATEGORY_ID });
		expect(builder.update).toHaveBeenCalledWith({ category_id: CATEGORY_ID });
		expect(builder.eq).toHaveBeenCalledWith('id', PRODUCT_ID);
	});

	it('deletes scoped to org and id, throwing on zero rows', async () => {
		const filtered = supabaseMock({ data: [] });
		await expect(deleteProduct(filtered.supabase, ORG_ID, PRODUCT_ID)).rejects.toThrow(
			'Product was not deleted'
		);
	});

	it('lists the category tree in display order', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listProductCategories(supabase, ORG_ID);
		expect(from).toHaveBeenCalledWith('product_categories');
		expect(builder.order).toHaveBeenCalledWith('sort_order');
		expect(builder.order).toHaveBeenCalledWith('name');
	});
});
