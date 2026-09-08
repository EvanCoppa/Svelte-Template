import type { Tables } from '$lib/database.types';

/**
 * Vocabulary — the words that are not a feature's name, as the org's
 * industry says them.
 *
 * `terms.ts` names the features ("Treatment plans", one "treatment plan").
 * Some words belong to no feature: the two people on a proposal are a
 * "Presenter" and a "Provider" in a practice, an "Estimator" and a "Project
 * manager" on a roof. Those are rows in `terms`, each with a default label
 * and an industry's own in `industry_terms` (the industry_vocabulary
 * migration) — the same shape as features / industry_features, minus the
 * modes. This file is the pure resolver; `loadVocabulary()` in
 * `$lib/server/features` reads the rows, the `(app)` layout ships the result
 * as `vocabulary`, and `term()` is the accessor. A word is never a constant
 * in `src/`.
 */

/**
 * The term ids the app knows at build time, in lockstep with the `terms`
 * table: the migration adding a term adds its id here, so a typo'd key is
 * a `check` error rather than a blank label.
 */
export const TERM_IDS = ['proposal_presenter', 'proposal_responsible'] as const;

export type TermId = (typeof TERM_IDS)[number];

/** A term with every industry's own word for it, as loaded. */
export type TermRegistryRow = Tables<'terms'> & {
	industry_terms: Pick<Tables<'industry_terms'>, 'industry_id' | 'label'>[];
};

/** Every term's label for one org — the industry's word where it has one, the default otherwise. */
export type Vocabulary = Record<TermId, string>;

/**
 * Fold the registry for one industry. A term the app knows but the table
 * lacks is a migration that did not ship, so it throws rather than labelling
 * a field with its id; a row the app does not know is ignored.
 */
export function resolveVocabulary(
	rows: readonly TermRegistryRow[],
	industryId: string
): Vocabulary {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const entries = TERM_IDS.map((id) => {
		const row = byId.get(id);
		if (!row) throw new Error(`The term registry has no row for ${id}.`);
		const own = row.industry_terms.find((industry) => industry.industry_id === industryId);
		return [id, own?.label ?? row.label] as const;
	});
	// SAFETY: `entries` has exactly one pair per TermId — it is built by mapping
	// TERM_IDS, and a missing row threw above — so the object is a complete Vocabulary.
	return Object.fromEntries(entries) as Vocabulary;
}

/** The word for a term, from the vocabulary the `(app)` layout shipped. */
export function term(vocabulary: Vocabulary | undefined, id: TermId): string {
	const label = vocabulary?.[id];
	if (!label) throw new Error(`No vocabulary for ${id}: the (app) layout did not ship it.`);
	return label;
}
