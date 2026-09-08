import { isVisible } from './resolve';
import type { FeatureMap } from './types';

/**
 * Terms — what things are called, as the org's industry words them.
 *
 * A feature's row names it (`features.name` / `features.noun`) and the
 * industry axis can rename it (`industry_features.name` / `noun`);
 * `resolveFeatures()` has already applied that by the time a feature map
 * exists. The sidebar and the page titles read the resolved feature
 * directly. The surfaces that name ONE record — "Add quote", "Quote
 * created", "3 quotes", "Quote not found" — read this map instead: the
 * `(app)` layout ships it as `terms`, and `recordTerms()` in
 * `$lib/crm/records` is the accessor for a kind of record.
 */

/**
 * What a feature is called: the list ("Quotes") and one row of it ("quote";
 * null when the feature is not a list of records).
 */
export type FeatureTerms = { name: string; noun: string | null };

/**
 * The terms of every feature this session may see, keyed by id — what the
 * `(app)` layout ships. Same predicate as the nav, so nothing is named that
 * the sidebar hides.
 */
export type TermsMap = Record<string, FeatureTerms>;

/** A feature's words in the three forms a surface needs: the list, one row, the list in running text. */
export type Terms = {
	/** The list, as the sidebar names it: "Treatment plans". */
	name: string;
	/** One of them, lower-case: "treatment plan" — "Add treatment plan". */
	noun: string;
	/** The list in running text: "treatment plans" — "3 treatment plans". */
	plural: string;
};

/**
 * The words for a feature that is a list of records, from the terms the
 * `(app)` layout shipped. Throws for a feature that is not on screen or
 * names no noun — unreachable on a page the gate served, so the throw keeps
 * the return type honest without a cast. `recordTerms()` in `$lib/crm/records`
 * is the same accessor keyed by record kind.
 */
export function featureTerms(terms: TermsMap | undefined, featureId: string): Terms {
	const found = terms?.[featureId];
	if (!found?.noun) {
		throw new Error(`No terms for ${featureId}: the ${featureId} feature is not on screen.`);
	}
	return { name: found.name, noun: found.noun, plural: found.name.toLowerCase() };
}

export function visibleTerms(
	features: FeatureMap,
	canRead: (featureId: string) => boolean
): TermsMap {
	return Object.fromEntries(
		Object.values(features)
			.filter((resolved) => isVisible(resolved, canRead))
			.map(({ feature }) => [feature.id, { name: feature.name, noun: feature.noun }])
	);
}
