import type { Feature, FeatureMap } from './types';

/**
 * What an upgrade would buy — the tier axis of the registry, shaped for the
 * upgrade prompt. Client-safe like the rest of this folder: the (app) layout
 * load builds the plans once per session with `upgradePlans()`, and the
 * prompt picks one to pitch with `pitchFor()` each time it opens.
 */

/** A feature a plan would switch on — as much of the row as the prompt shows. */
export type UpgradeUnlock = Pick<Feature, 'id' | 'name' | 'description' | 'icon'>;

/** A plan above the org's own, with the features it would unlock for this org. */
export type UpgradePlan = { id: string; name: string; unlocks: UpgradeUnlock[] };

/** The tier rows as `listTiersWithFeatures()` returns them — structural, so this module stays server-free. */
type TierRow = { id: string; name: string; tier_features: readonly { feature_id: string }[] };

/**
 * Every plan worth pitching, smallest first: the tiers that are not the
 * org's own and carry at least one feature locked for the org today. Fewest
 * features means the cheapest step up, since plans nest. A plan's unlocks
 * are its `locked_visible` features in registry order — a feature the org
 * already has, or one hidden from it, is never listed as a gain.
 */
export function upgradePlans(
	tiers: readonly TierRow[],
	features: FeatureMap,
	currentTierId: string
): UpgradePlan[] {
	return [...tiers]
		.filter((tier) => tier.id !== currentTierId)
		.sort((a, b) => a.tier_features.length - b.tier_features.length || a.name.localeCompare(b.name))
		.map((tier) => ({
			id: tier.id,
			name: tier.name,
			unlocks: tier.tier_features
				.map((t) => features[t.feature_id])
				.filter((f) => f?.mode === 'locked_visible')
				.map(({ feature }) => feature)
				.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
				.map(({ id, name, description, icon }) => ({ id, name, description, icon }))
		}))
		.filter((plan) => plan.unlocks.length > 0);
}

/**
 * What the prompt shows: the plan, the feature that prompted it when that
 * plan unlocks it, and the plan's unlocks with that feature first.
 */
export type UpgradePitch = {
	plan: UpgradePlan;
	feature: UpgradeUnlock | null;
	unlocks: UpgradeUnlock[];
};

/**
 * The pitch for a feature: the smallest plan that unlocks it. With no feature
 * named — or one no plan unlocks, because the org has it already — the next
 * step up. Null on the top plan, when there is nothing left to sell.
 */
export function pitchFor(
	plans: readonly UpgradePlan[],
	wanted: string | null
): UpgradePitch | null {
	const plan =
		plans.find((p) => wanted !== null && p.unlocks.some((f) => f.id === wanted)) ??
		plans.at(0) ??
		null;
	if (!plan) return null;
	const feature = plan.unlocks.find((f) => f.id === wanted) ?? null;
	const unlocks = feature ? [feature, ...plan.unlocks.filter((f) => f !== feature)] : plan.unlocks;
	return { plan, feature, unlocks };
}
