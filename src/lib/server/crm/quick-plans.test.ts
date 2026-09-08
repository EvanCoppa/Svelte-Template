import { describe, expect, it } from 'vitest';
import { createQuickPlan, deleteQuickPlan, listQuickPlans, updateQuickPlan } from './quick-plans';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

const PLAN_ID = 'c2000000-0000-0000-0000-000000000001';
const CROWN = 'c1000000-0000-0000-0000-000000000001';
const WHITENING = 'c1000000-0000-0000-0000-000000000002';
const SELECT =
	'*, quick_plan_billables(sort_order, billables(id, code, name, unit_price, currency, unit, unit_choices, is_active))';

describe('quick plans data access', () => {
	it('lists the bundles with their billables, both in order', async () => {
		const rows = [{ id: PLAN_ID, name: 'Crown and whitening', quick_plan_billables: [] }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listQuickPlans(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('quick_plans');
		expect(builder.select).toHaveBeenCalledWith(SELECT);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'quick_plan_billables'
		});
	});

	it('creates the bundle, then its members in the order given', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: PLAN_ID } },
			{ data: null }
		]);

		await createQuickPlan(supabase, ORG_ID, { name: 'Crown and whitening' }, [CROWN, WHITENING]);
		expect(from).toHaveBeenNthCalledWith(1, 'quick_plans');
		expect(from).toHaveBeenNthCalledWith(2, 'quick_plan_billables');
		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			name: 'Crown and whitening',
			org_id: ORG_ID
		});
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: CROWN, sort_order: 0 },
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: WHITENING, sort_order: 1 }
		]);
	});

	it('replaces the members on update: rename, clear, insert the new set', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: PLAN_ID } },
			{ data: null },
			{ data: null }
		]);

		await updateQuickPlan(supabase, ORG_ID, PLAN_ID, { name: 'Hygiene visit' }, [WHITENING]);
		expect(builder.update).toHaveBeenCalledWith({ name: 'Hygiene visit' });
		expect(from).toHaveBeenNthCalledWith(2, 'quick_plan_billables');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('quick_plan_id', PLAN_ID);
		expect(builder.insert).toHaveBeenCalledWith([
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: WHITENING, sort_order: 0 }
		]);
	});

	it('deletes scoped to org and id, with evidence', async () => {
		const deleted = supabaseMock({ data: [{ id: PLAN_ID }] });
		await deleteQuickPlan(deleted.supabase, ORG_ID, PLAN_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteQuickPlan(filtered.supabase, ORG_ID, PLAN_ID)).rejects.toThrow(
			'Quick plan was not deleted'
		);
	});
});
