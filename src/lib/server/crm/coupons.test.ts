import { describe, expect, it } from 'vitest';
import { createCoupon, deleteCoupon, getCoupon, listCoupons, updateCoupon } from './coupons';
import { ORG_ID, supabaseMock } from './test-support';

const COUPON_ID = 'f3000000-0000-0000-0000-000000000001';

describe('coupons data access', () => {
	it('lists the live ones first, then by code', async () => {
		const rows = [{ id: COUPON_ID, code: 'SPRING20' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listCoupons(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('coupons');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenNthCalledWith(1, 'is_active', { ascending: false });
		expect(builder.order).toHaveBeenNthCalledWith(2, 'code');
	});

	it('narrows to the live ones only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listCoupons(supabase, ORG_ID, { activeOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('is_active', true);

		const bare = supabaseMock({ data: [] });
		await listCoupons(bare.supabase, ORG_ID);
		expect(bare.builder.eq).toHaveBeenCalledTimes(1);
	});

	it('fetches one coupon, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getCoupon(supabase, ORG_ID, COUPON_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', COUPON_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a coupon in the org, leaving authorship to the database', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: COUPON_ID } });

		await createCoupon(supabase, ORG_ID, {
			code: 'SPRING20',
			discount_type: 'percent',
			discount_value: 20,
			ends_on: '2026-06-30'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			code: 'SPRING20',
			discount_type: 'percent',
			discount_value: 20,
			ends_on: '2026-06-30',
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: COUPON_ID } });
		await updateCoupon(updated.supabase, ORG_ID, COUPON_ID, { is_active: false });
		expect(updated.builder.update).toHaveBeenCalledWith({ is_active: false });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', COUPON_ID);

		const deleted = supabaseMock({ data: [{ id: COUPON_ID }] });
		await deleteCoupon(deleted.supabase, ORG_ID, COUPON_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteCoupon(filtered.supabase, ORG_ID, COUPON_ID)).rejects.toThrow(
			'Coupon was not deleted'
		);
	});
});
