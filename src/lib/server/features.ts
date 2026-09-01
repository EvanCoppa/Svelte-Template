import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { FeatureRegistryRow } from '$lib/features/types';
import { ensure, unwrap } from './crm/unwrap';

/**
 * Data access for the feature registry and the org's own opt-outs. Same
 * contract as the crm modules: the request-scoped client (`locals.supabase`)
 * so RLS decides visibility, plus ids from the org context. The registry
 * tables are reference data (select-only for clients); the one thing the
 * browser writes is `organization_disabled_features`, owner/admin via RLS.
 * Overrides have no write path here on purpose — they are an operator's
 * tool (SQL / service role), exactly like `tier_id`.
 */

/** A tier with the features it unlocks, for the upgrade page. */
export type TierWithFeatures = Tables<'tiers'> & { tier_features: { feature_id: string }[] };

/**
 * Every feature with its industry and tier maps, in one round trip — the
 * input `resolveFeatures()` folds per org. Ordered for the nav.
 */
export async function loadFeatureRegistry(
	supabase: SupabaseClient<Database>
): Promise<FeatureRegistryRow[]> {
	return unwrap(
		await supabase
			.from('features')
			.select('*, industry_features(industry_id), tier_features(tier_id)')
			.order('sort_order')
	);
}

export async function listTiersWithFeatures(
	supabase: SupabaseClient<Database>
): Promise<TierWithFeatures[]> {
	return unwrap(await supabase.from('tiers').select('*, tier_features(feature_id)').order('name'));
}

/**
 * Apply a diff to the org's opt-outs: `disable` inserts rows, `enable`
 * deletes them. RLS refuses an insert for a feature that is not available
 * to the org (locked or hidden), so callers validate first for a friendly
 * message and rely on the policy as the backstop.
 */
export async function setDisabledFeatures(
	supabase: SupabaseClient<Database>,
	orgId: string,
	{ disable, enable }: { disable: readonly string[]; enable: readonly string[] }
): Promise<void> {
	if (disable.length > 0) {
		ensure(
			await supabase
				.from('organization_disabled_features')
				.insert(disable.map((feature_id) => ({ org_id: orgId, feature_id })))
		);
	}
	if (enable.length > 0) {
		ensure(
			await supabase
				.from('organization_disabled_features')
				.delete()
				.eq('org_id', orgId)
				.in('feature_id', [...enable])
		);
	}
}
