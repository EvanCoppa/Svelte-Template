import { describe, expect, it } from 'vitest';
import {
	createProductCategory,
	deleteProductCategory,
	getProductCategory,
	listProductCategories,
	updateProductCategory
} from './product-categories';
import { ORG_ID, supabaseMock } from './test-support';

const CATEGORY_ID = 'b1000000-0000-0000-0000-000000000001';

describe('product categories data access', () => {
	it('reads the whole tree flat, in sibling order, with each node’s product count', async () => {
		const rows = [{ id: CATEGORY_ID, name: 'Materials', products: [{ count: 2 }] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listProductCategories(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('product_categories');
		// The count is an embed; the parent and children are NOT — PostgREST
		// cannot embed the self-referencing composite key, so the tree is
		// nested in `$lib/crm/categories`.
		expect(builder.select).toHaveBeenCalledWith('*, products(count)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenNthCalledWith(1, 'sort_order');
		expect(builder.order).toHaveBeenNthCalledWith(2, 'name');
	});

	it('fetches one category, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getProductCategory(supabase, ORG_ID, CATEGORY_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', CATEGORY_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a category in the org, under a parent or at the root', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: CATEGORY_ID } });

		await createProductCategory(supabase, ORG_ID, {
			name: 'Fixings',
			parent_id: CATEGORY_ID,
			description: null,
			sort_order: 100
		});
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Fixings',
			parent_id: CATEGORY_ID,
			description: null,
			sort_order: 100,
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: CATEGORY_ID } });
		await updateProductCategory(updated.supabase, ORG_ID, CATEGORY_ID, { parent_id: null });
		expect(updated.builder.update).toHaveBeenCalledWith({ parent_id: null });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', CATEGORY_ID);

		const deleted = supabaseMock({ data: [{ id: CATEGORY_ID }] });
		await deleteProductCategory(deleted.supabase, ORG_ID, CATEGORY_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteProductCategory(filtered.supabase, ORG_ID, CATEGORY_ID)).rejects.toThrow(
			'Category was not deleted'
		);
	});
});
