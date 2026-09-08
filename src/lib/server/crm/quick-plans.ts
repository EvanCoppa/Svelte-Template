import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { Billable } from './billables';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `quick_plans` — named bundles of billables that fill a
 * proposal option in one click (the builder's "Quick Select" chips). A
 * bundle is its row plus the join rows naming its billables in order; the
 * two are always read and written together, because a bundle with no
 * members is not a bundle.
 *
 * Same contract as billables.ts. Replacing a bundle's members is a delete
 * and an insert: the join rows carry nothing but order, so there is nothing
 * to edit in place, and PostgREST offers no transaction across the two —
 * a refusal between them leaves the bundle empty, which the page reports.
 */

export type QuickPlan = Tables<'quick_plans'>;

/** What the builder and the bundles page need of a member: enough to make a line. */
export type QuickPlanBillable = Pick<
	Billable,
	'id' | 'code' | 'name' | 'unit_price' | 'currency' | 'unit' | 'unit_choices' | 'is_active'
>;

export type QuickPlanWithBillables = QuickPlan & {
	quick_plan_billables: { sort_order: number; billables: QuickPlanBillable }[];
};

const SELECT =
	'*, quick_plan_billables(sort_order, billables(id, code, name, unit_price, currency, unit, unit_choices, is_active))';

type QuickPlanColumn = 'name' | 'sort_order';

export async function listQuickPlans(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<QuickPlanWithBillables[]> {
	return unwrap(
		await supabase
			.from('quick_plans')
			.select(SELECT)
			.eq('org_id', orgId)
			.order('sort_order')
			.order('name')
			.order('sort_order', { referencedTable: 'quick_plan_billables' })
	);
}

export async function createQuickPlan(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'quick_plans'>, QuickPlanColumn>,
	billableIds: readonly string[]
): Promise<QuickPlan> {
	const plan = unwrap(
		await supabase
			.from('quick_plans')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
	await setMembers(supabase, orgId, plan.id, billableIds);
	return plan;
}

export async function updateQuickPlan(
	supabase: SupabaseClient<Database>,
	orgId: string,
	quickPlanId: string,
	values: Pick<TablesUpdate<'quick_plans'>, QuickPlanColumn>,
	billableIds: readonly string[]
): Promise<QuickPlan> {
	const plan = unwrap(
		await supabase
			.from('quick_plans')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', quickPlanId)
			.select()
			.single()
	);
	ensure(
		await supabase
			.from('quick_plan_billables')
			.delete()
			.eq('org_id', orgId)
			.eq('quick_plan_id', quickPlanId)
	);
	await setMembers(supabase, orgId, quickPlanId, billableIds);
	return plan;
}

export async function deleteQuickPlan(
	supabase: SupabaseClient<Database>,
	orgId: string,
	quickPlanId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('quick_plans')
			.delete()
			.eq('org_id', orgId)
			.eq('id', quickPlanId)
			.select('id'),
		'Quick plan'
	);
}

/** The bundle's members, in the order given — one insert for all of them. */
async function setMembers(
	supabase: SupabaseClient<Database>,
	orgId: string,
	quickPlanId: string,
	billableIds: readonly string[]
): Promise<void> {
	if (billableIds.length === 0) return;
	ensure(
		await supabase.from('quick_plan_billables').insert(
			billableIds.map((billable_id, index) => ({
				org_id: orgId,
				quick_plan_id: quickPlanId,
				billable_id,
				sort_order: index
			}))
		)
	);
}
