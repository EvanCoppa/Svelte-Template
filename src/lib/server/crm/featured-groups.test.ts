import { describe, expect, it } from 'vitest';
import {
	createFeaturedGroup,
	deleteFeaturedGroup,
	listFeaturedGroups,
	updateFeaturedGroup
} from './featured-groups';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

const GROUP_ID = 'c3000000-0000-0000-0000-000000000001';
const GLOVES = 'c4000000-0000-0000-0000-000000000001';
const MASKS = 'c4000000-0000-0000-0000-000000000002';
const SELECT =
	'*, featured_group_products(sort_order, products(id, sku, name, unit_price, currency, unit, image_url, is_active))';

describe('featured groups data access', () => {
	it('lists the groups with their products, both in order', async () => {
		const rows = [{ id: GROUP_ID, name: 'Spring promo', featured_group_products: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listFeaturedGroups(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('featured_groups');
		expect(builder.select).toHaveBeenCalledWith(SELECT);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'featured_group_products'
		});
	});

	it('creates the group, then its members in the order given', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: GROUP_ID } },
			{ data: null }
		]);

		await createFeaturedGroup(
			supabase,
			ORG_ID,
			{ name: 'Spring promo', description: null, is_active: true },
			[GLOVES, MASKS]
		);
		expect(from).toHaveBeenNthCalledWith(1, 'featured_groups');
		expect(from).toHaveBeenNthCalledWith(2, 'featured_group_products');
		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			name: 'Spring promo',
			description: null,
			is_active: true,
			org_id: ORG_ID
		});
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: GLOVES, sort_order: 0 },
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: MASKS, sort_order: 1 }
		]);
	});

	it('replaces the members on update: rename, clear, insert the new set', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: GROUP_ID } },
			{ data: null },
			{ data: null }
		]);

		await updateFeaturedGroup(
			supabase,
			ORG_ID,
			GROUP_ID,
			{ name: 'Summer promo', description: null, is_active: false },
			[MASKS]
		);
		expect(builder.update).toHaveBeenCalledWith({
			name: 'Summer promo',
			description: null,
			is_active: false
		});
		expect(from).toHaveBeenNthCalledWith(2, 'featured_group_products');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('featured_group_id', GROUP_ID);
		expect(builder.insert).toHaveBeenCalledWith([
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: MASKS, sort_order: 0 }
		]);
	});

	it('leaves a group empty rather than inserting nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: { id: GROUP_ID } }]);

		await createFeaturedGroup(
			supabase,
			ORG_ID,
			{ name: 'Empty shelf', description: null, is_active: true },
			[]
		);
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('deletes scoped to org and id, with evidence', async () => {
		const deleted = supabaseMock({ data: [{ id: GROUP_ID }] });
		await deleteFeaturedGroup(deleted.supabase, ORG_ID, GROUP_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteFeaturedGroup(filtered.supabase, ORG_ID, GROUP_ID)).rejects.toThrow(
			'Featured group was not deleted'
		);
	});
});
