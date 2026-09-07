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

/** A board with its columns in order — what a pipeline view renders from. */
export type PipelineWithStages = Pipeline & { pipeline_stages: PipelineStage[] };

export async function listPipelines(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<PipelineWithStages[]> {
	return unwrap(
		await supabase
			.from('pipelines')
			.select('*, pipeline_stages(*)')
			.eq('org_id', orgId)
			.order('sort_order')
			.order('sort_order', { referencedTable: 'pipeline_stages' })
	);
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
			.select('*, pipeline_stages(*)')
			.eq('org_id', orgId)
			.eq('is_default', true)
			.order('sort_order', { referencedTable: 'pipeline_stages' })
			.maybeSingle()
	);
}
