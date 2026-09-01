import { redirect } from '@sveltejs/kit';
import { listTiersWithFeatures } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/**
 * Where a locked_visible feature lands: what it is, which plan the org is
 * on, and which plans include it. Informational only — tier changes are
 * service-role territory (billing code, an operator), never a browser write,
 * so there is no action here. Exempt from the feature gate so it is always
 * reachable in response to a gate decision.
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

	const tiers = (await listTiersWithFeatures(locals.supabase)).map((tier) => ({
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
		tiers
	};
};
