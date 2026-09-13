import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { defaultPipeline, listPipelines } from './pipelines';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `deals` (the sales pipeline). Same contract as companies.ts:
 * request-scoped client + active org id, write params Picked to the columns
 * the migration grants, `created_by` filled by the database, deletes gated
 * to owner/admin by RLS and verified by `unwrapDeleted`.
 *
 * A deal names at most one company and at most one person, and both may be
 * null: an opportunity nobody is attached to yet is a legitimate row. Its
 * position is a `stage_id` into `pipeline_stages`, not an enum — omit both ids
 * on insert and the database drops it into the org's default board at the
 * first stage (see the pipelines migration).
 */

export type Deal = Tables<'deals'>;

/** A deal with both parties and its stage, for pipeline/list screens. */
export type DealWithParties = Deal & {
	companies: Pick<Tables<'companies'>, 'id' | 'name'> | null;
	contacts: Pick<Tables<'contacts'>, 'id' | 'name'> | null;
	pipeline_stages: Pick<Tables<'pipeline_stages'>, 'id' | 'name' | 'outcome' | 'sort_order'>;
};

type DealColumn =
	| 'company_id'
	| 'contact_id'
	| 'title'
	| 'amount'
	| 'pipeline_id'
	| 'stage_id'
	| 'expected_close_date'
	| 'assigned_to';

/**
 * Insert values. A deal is either placed explicitly — and then it needs BOTH
 * ids, because a stage only means something inside its own pipeline — or not
 * placed at all, and lands in the org's default board at the first stage. The
 * union says exactly that, so "stage without pipeline" is unrepresentable
 * rather than a foreign-key error at runtime.
 */
type DealInsert = Pick<TablesInsert<'deals'>, Exclude<DealColumn, 'pipeline_id' | 'stage_id'>> &
	({ pipeline_id: string; stage_id: string } | { pipeline_id?: undefined; stage_id?: undefined });

export async function listDeals(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; contactId?: string; pipelineId?: string; stageId?: string } = {}
): Promise<DealWithParties[]> {
	let query = supabase
		.from('deals')
		.select(
			'*, companies(id, name), contacts(id, name), pipeline_stages!inner(id, name, outcome, sort_order)'
		)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.pipelineId) query = query.eq('pipeline_id', filter.pipelineId);
	if (filter.stageId) query = query.eq('stage_id', filter.stageId);
	return unwrap(await query);
}

export async function getDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string
): Promise<DealWithParties | null> {
	return unwrap(
		await supabase
			.from('deals')
			.select(
				'*, companies(id, name), contacts(id, name), pipeline_stages!inner(id, name, outcome, sort_order)'
			)
			.eq('org_id', orgId)
			.eq('id', dealId)
			.maybeSingle()
	);
}

export async function createDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: DealInsert
): Promise<Deal> {
	// The database would place an unplaced deal too (a BEFORE INSERT trigger, so
	// SQL imports and the seed get the same behaviour), but the columns are NOT
	// NULL and the generated Insert type demands them. Resolving here keeps the
	// payload honest instead of casting past the contract.
	const placement = values.pipeline_id
		? { pipeline_id: values.pipeline_id, stage_id: values.stage_id }
		: await defaultPlacement(supabase, orgId);

	return unwrap(
		await supabase
			.from('deals')
			.insert({ ...values, ...placement, org_id: orgId })
			.select()
			.single()
	);
}

/** The org's default board and its first stage — where an unplaced deal goes. */
async function defaultPlacement(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<{ pipeline_id: string; stage_id: string }> {
	const board = await defaultPipeline(supabase, orgId);
	const first = board?.pipeline_stages.at(0);
	if (!board || !first) {
		throw new Error('This organization has no default pipeline to place the deal in.');
	}
	return { pipeline_id: board.id, stage_id: first.id };
}

/**
 * The board a stage belongs to, as the pair `deals` stores. A stage only means
 * something inside its own pipeline, so the two ids always move together — and
 * looking the pair up here is also what proves the stage is this org's:
 * `listPipelines` reads through RLS, so a forged id simply is not in the list.
 *
 * The one place that answers "which board is this stage on", for the record
 * form and for `moveDeal()` below.
 */
export async function dealPlacement(
	supabase: SupabaseClient<Database>,
	orgId: string,
	stageId: string
): Promise<{ pipeline_id: string; stage_id: string }> {
	const boards = await listPipelines(supabase, orgId);
	for (const board of boards) {
		if (board.pipeline_stages.some((stage) => stage.id === stageId)) {
			return { pipeline_id: board.id, stage_id: stageId };
		}
	}
	throw new Error('That stage is not on any board in this organization.');
}

/**
 * A deal moved to another stage — a card dropped on the pipeline board, or
 * carried there with the arrow keys. The board is written with the stage
 * rather than taken from the caller, so a move onto another board carries the
 * deal there too; a stage on no board of this org is refused above.
 */
export async function moveDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string,
	stageId: string
): Promise<Deal> {
	return updateDeal(supabase, orgId, dealId, await dealPlacement(supabase, orgId, stageId));
}

export async function updateDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string,
	values: Pick<TablesUpdate<'deals'>, DealColumn>
): Promise<Deal> {
	return unwrap(
		await supabase
			.from('deals')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', dealId)
			.select()
			.single()
	);
}

export async function deleteDeal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	dealId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('deals').delete().eq('org_id', orgId).eq('id', dealId).select('id'),
		'Deal'
	);
}
