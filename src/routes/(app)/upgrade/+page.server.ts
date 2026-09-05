import { redirect } from '@sveltejs/kit';
import type { FeatureMap } from '$lib/features/types';
import { listTiersWithFeatures, type TierWithFeatures } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/**
 * Where a locked_visible feature lands: what it is, which plan the org is
 * on, which plans include it — and the one plan worth pitching, with what it
 * unlocks. Informational only — tier changes are service-role territory
 * (billing code, an operator), never a browser write, so there is no action
 * here. Exempt from the feature gate so it is always reachable in response
 * to a gate decision.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.org) throw redirect(303, '/login');
	const { activeOrg, features } = locals.org;

	// Tolerate a missing or unknown id: the page must never 500 on a bad
	// query string. A hidden feature is deliberately not named either — it
	// does not exist for this org.
	const requested = url.searchParams.get('feature');
	const resolved = requested ? features[requested] : undefined;
	const feature = resolved && resolved.mode !== 'hidden' ? resolved : null;

	const tiersWithFeatures = await listTiersWithFeatures(locals.supabase);
	const tiers = tiersWithFeatures.map((tier) => ({
		id: tier.id,
		name: tier.name,
		current: tier.id === activeOrg.tierId,
		includes: feature ? tier.tier_features.some((t) => t.feature_id === feature.feature.id) : false,
		featureCount: tier.tier_features.length
	}));

	return {
		feature: feature?.feature ?? null,
		mode: feature?.mode ?? null,
		currentTier: { id: activeOrg.tierId, name: activeOrg.tierName },
		tiers,
		recommended: recommend(tiersWithFeatures, features, {
			tierId: activeOrg.tierId,
			// Only a locked feature can steer the pitch; an enabled one is
			// already in the plan, so the pitch falls back to the next step up.
			wanted: feature?.mode === 'locked_visible' ? feature.feature.id : null
		})
	};
};

/** The plan the card pitches, with the features it would switch on. */
type RecommendedTier = {
	id: string;
	name: string;
	unlocks: { id: string; name: string; description: string | null }[];
};

/**
 * Which plan to pitch: the smallest tier (fewest features — plans nest, so
 * that is the cheapest step up) that unlocks something locked for this org
 * today, and includes the wanted feature when there is one. Its unlocks are
 * the `locked_visible` features it carries, wanted first, then registry
 * order. On the top plan nothing qualifies, and the page pitches nothing.
 */
function recommend(
	tiers: readonly TierWithFeatures[],
	features: FeatureMap,
	{ tierId, wanted }: { tierId: string; wanted: string | null }
): RecommendedTier | null {
	const bySize = [...tiers]
		.filter((tier) => tier.id !== tierId)
		.sort(
			(a, b) => a.tier_features.length - b.tier_features.length || a.name.localeCompare(b.name)
		);

	for (const tier of bySize) {
		const unlocks = tier.tier_features
			.map((t) => features[t.feature_id])
			.filter((f) => f?.mode === 'locked_visible')
			.map(({ feature }) => feature)
			.sort(
				(a, b) =>
					Number(b.id === wanted) - Number(a.id === wanted) ||
					a.sort_order - b.sort_order ||
					a.name.localeCompare(b.name)
			)
			.map(({ id, name, description }) => ({ id, name, description }));
		if (unlocks.length === 0) continue;
		if (wanted && !unlocks.some((f) => f.id === wanted)) continue;
		return { id: tier.id, name: tier.name, unlocks };
	}
	return null;
}
