import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { FeatureRegistryRow, PageRow } from '$lib/features/types';
import type { ViewRegistryRow } from '$lib/views/resolve';
import { resolveVocabulary, type TermRegistryRow, type Vocabulary } from '$lib/features/vocabulary';
import { ensure, unwrap } from './crm/unwrap';

/**
 * Data access for the feature and page registries and the org's own
 * opt-outs. Same
 * contract as the crm modules: the request-scoped client (`locals.supabase`)
 * so RLS decides visibility, plus ids from the org context. The registry
 * tables are reference data (select-only for clients); the one thing the
 * browser writes is `organization_disabled_features`, owner/admin via RLS.
 * Overrides have no write path here on purpose — they are an operator's
 * tool (SQL / service role), exactly like `tier_id`.
 */

/** A tier with the features it unlocks — the upgrade prompt's plans come from these. */
export type TierWithFeatures = Tables<'tiers'> & { tier_features: { feature_id: string }[] };

/**
 * Every feature with its industry and tier maps, in one round trip — the
 * input `resolveFeatures()` folds per org. Each industry row carries the
 * industry's own words for the feature, if any. Ordered for the nav.
 */
export async function loadFeatureRegistry(
	supabase: SupabaseClient<Database>
): Promise<FeatureRegistryRow[]> {
	return unwrap(
		await supabase
			.from('features')
			.select('*, industry_features(industry_id, name, noun), tier_features(tier_id)')
			.order('sort_order')
	);
}

/**
 * Every registered page with its title, ordered by path — what the `(app)`
 * layout titles the shell from. `visiblePages()` filters it for the session
 * and fills in the titles that follow a feature before it reaches the browser.
 */
export async function loadPageRegistry(supabase: SupabaseClient<Database>): Promise<PageRow[]> {
	return unwrap(await supabase.from('pages').select('id, feature_id, path, title').order('path'));
}

/**
 * Every view's definition (the views migration) — what the one view page
 * resolves its slug against. Reference data; whether a session may see a
 * view is its feature's mode, already in the org context.
 */
export async function loadViewRegistry(
	supabase: SupabaseClient<Database>
): Promise<ViewRegistryRow[]> {
	return unwrap(
		await supabase
			.from('views')
			.select('id, source, filter, columns, layouts, default_layout')
			.order('id')
	);
}

/**
 * Every term with each industry's own word for it — the input
 * `resolveVocabulary()` folds per org. Reference data, like the features.
 */
export async function loadTermRegistry(
	supabase: SupabaseClient<Database>
): Promise<TermRegistryRow[]> {
	return unwrap(
		await supabase.from('terms').select('*, industry_terms(industry_id, label)').order('id')
	);
}

/** The words as one org's industry says them — what the (app) layout ships as `vocabulary`. */
export async function loadVocabulary(
	supabase: SupabaseClient<Database>,
	industryId: string
): Promise<Vocabulary> {
	return resolveVocabulary(await loadTermRegistry(supabase), industryId);
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
