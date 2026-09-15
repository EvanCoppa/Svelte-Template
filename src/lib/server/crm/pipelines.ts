import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import { unwrap } from './unwrap';

/**
 * Data access for `pipelines` and `pipeline_stages` — the boards a deal moves
 * across, which are org configuration rather than a fixed enum (see the
 * pipelines migration). Every org gets a default "Sales" board on creation, so
 * a caller can always assume `defaultPipeline()` returns one.
 *
 * Reads only, for now: shaping a board is owner/admin work that belongs in a
 * settings screen, and RLS already refuses it to anyone else. Adding writes
 * here follows the companies.ts pattern exactly.
 */

export type Pipeline = Tables<'pipelines'>;
export type PipelineStage = Tables<'pipeline_stages'>;

/** A stage with the column it shares with others, if any — see `buildDealColumns()`. */
export type PipelineStageWithGroup = PipelineStage & {
	pipeline_stage_groups: Pick<Tables<'pipeline_stage_groups'>, 'label'> | null;
};

/** A board with its columns in order — what a pipeline view renders from. */
export type PipelineWithStages = Pipeline & { pipeline_stages: PipelineStageWithGroup[] };

export async function listPipelines(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<PipelineWithStages[]> {
	return unwrap(
		await supabase
			.from('pipelines')
			.select('*, pipeline_stages(*, pipeline_stage_groups(label))')
			.eq('org_id', orgId)
			.order('sort_order')
			.order('sort_order', { referencedTable: 'pipeline_stages' })
	);
}

/**
 * A stage's own name, for a timeline entry that names where a deal came from
 * or landed — the one lookup that doesn't need the whole board. RLS scopes
 * it the way every other read here is scoped, without an explicit org_id
 * filter: a stage id from another org simply is not visible.
 */
export async function getStageName(
	supabase: SupabaseClient<Database>,
	stageId: string
): Promise<string | null> {
	const stage = await unwrap(
		await supabase.from('pipeline_stages').select('name').eq('id', stageId).maybeSingle()
	);
	return stage?.name ?? null;
}

/**
 * The board new deals land in. Never null in practice — the organizations
 * trigger creates one per org and the migration backfilled the rest — but the
 * signature stays honest about what the query can return.
 */
export async function defaultPipeline(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<PipelineWithStages | null> {
	return unwrap(
		await supabase
			.from('pipelines')
			.select('*, pipeline_stages(*, pipeline_stage_groups(label))')
			.eq('org_id', orgId)
			.eq('is_default', true)
			.order('sort_order', { referencedTable: 'pipeline_stages' })
			.maybeSingle()
	);
}
