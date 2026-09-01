import type {
	Feature,
	FeatureMap,
	FeatureMode,
	FeatureOverride,
	FeatureRegistryRow
} from './types';

/** What the resolver needs to know about one organization. */
export type OrgFeatureState = {
	tierId: string;
	industryId: string;
	overrides: readonly FeatureOverride[];
	/** Feature ids the org switched off itself (organization_disabled_features). */
	disabled: readonly string[];
};

/**
 * Pure resolver — folds the registry, the org's industry and tier, its
 * operator overrides and its own opt-outs into one mode per feature.
 *
 * Resolution order (first match wins):
 *   1. override hidden / locked_visible           -> that mode
 *   2. override enabled, or in industry AND tier  -> disabled if the org
 *                                                    switched it off, else enabled
 *   3. in industry (but not the tier)             -> locked_visible
 *   4. otherwise                                  -> hidden
 *
 * `private.feature_mode()` in the features migration mirrors this exactly —
 * keep the two in sync. The resolver never inspects ids for specific values:
 * it works purely on the rows, so adding a feature needs no change here.
 */
export function resolveFeatures(
	registry: readonly FeatureRegistryRow[],
	org: OrgFeatureState
): FeatureMap {
	const overrides = new Map(org.overrides.map((o) => [o.feature_id, o.mode]));
	const disabled = new Set(org.disabled);
	const features: FeatureMap = {};

	for (const row of registry) {
		const inIndustry = row.industry_features.some((i) => i.industry_id === org.industryId);
		const inTier = row.tier_features.some((t) => t.tier_id === org.tierId);
		features[row.id] = {
			feature: stripMaps(row),
			mode: modeFor(overrides.get(row.id), inIndustry, inTier, disabled.has(row.id))
		};
	}

	return features;
}

function modeFor(
	override: FeatureMode | undefined,
	inIndustry: boolean,
	inTier: boolean,
	orgDisabled: boolean
): FeatureMode {
	if (override === 'hidden' || override === 'locked_visible') return override;
	if (override === 'enabled' || (inIndustry && inTier)) {
		return orgDisabled ? 'disabled' : 'enabled';
	}
	return inIndustry ? 'locked_visible' : 'hidden';
}

/** The plain feature row, without the embedded industry/tier maps. */
function stripMaps(row: FeatureRegistryRow): Feature {
	const { id, name, description, route, icon, category, sort_order, created_at } = row;
	return { id, name, description, route, icon, category, sort_order, created_at };
}
