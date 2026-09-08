import type {
	Feature,
	FeatureMap,
	FeatureMode,
	FeatureOverride,
	FeatureRegistryRow,
	ResolvedFeature
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
 * operator overrides and its own opt-outs into one mode per feature, and
 * words each feature the way the org's industry does.
 *
 * Resolution order (first match wins):
 *   1. override hidden / locked_visible           -> that mode
 *   2. override enabled, or in industry AND tier  -> disabled if the org
 *                                                    switched it off, else enabled
 *   3. in industry (but not the tier)             -> locked_visible
 *   4. otherwise                                  -> hidden
 *
 * `private.feature_mode()` in the features migration mirrors the modes
 * exactly — keep the two in sync. Naming is app-side only: the industry's
 * own `name` / `noun` (industry_features) replace the feature's where set,
 * and no policy ever needs a name. The resolver never inspects ids for
 * specific values: it works purely on the rows, so adding a feature needs
 * no change here.
 */
export function resolveFeatures(
	registry: readonly FeatureRegistryRow[],
	org: OrgFeatureState
): FeatureMap {
	const overrides = new Map(org.overrides.map((o) => [o.feature_id, o.mode]));
	const disabled = new Set(org.disabled);
	const features: FeatureMap = {};

	for (const row of registry) {
		const industry = row.industry_features.find((i) => i.industry_id === org.industryId);
		const inTier = row.tier_features.some((t) => t.tier_id === org.tierId);
		features[row.id] = {
			feature: wordedBy(stripMaps(row), industry),
			mode: modeFor(overrides.get(row.id), industry !== undefined, inTier, disabled.has(row.id))
		};
	}

	return features;
}

/**
 * Whether the nav would show a feature: enabled or locked (an upgrade
 * tease), and readable. The one predicate behind the sidebar, the page
 * titles and the terms the layout ships, so nothing is ever named or linked
 * that the sidebar hides.
 */
export function isVisible(
	{ mode, feature }: ResolvedFeature,
	canRead: (featureId: string) => boolean
): boolean {
	return (mode === 'enabled' || mode === 'locked_visible') && canRead(feature.id);
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
	const { id, name, noun, description, route, icon, category, sort_order, created_at } = row;
	return { id, name, noun, description, route, icon, category, sort_order, created_at };
}

/**
 * The row as the org's industry words it: the industry's own name and noun
 * where its row sets them, the feature's otherwise.
 */
function wordedBy(
	feature: Feature,
	industry: { name: string | null; noun: string | null } | undefined
): Feature {
	return { ...feature, name: industry?.name ?? feature.name, noun: industry?.noun ?? feature.noun };
}
