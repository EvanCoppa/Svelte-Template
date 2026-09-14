import { z } from 'zod';

/** Rename a vertical. Its id, which orgs and roles point at, is not editable. */
export const renameIndustrySchema = z.object({
	name: z.string().trim().min(1, 'Name the vertical.').max(60, 'Keep the name under 60 characters.')
});

/**
 * Exactly which features this vertical includes at all. A feature absent from
 * the set does not exist for an organization in this vertical — its pages
 * 404 — which is a stronger statement than a plan not unlocking it.
 */
export const industryFeaturesSchema = z.object({
	featureIds: z.array(z.string()).default([])
});

/**
 * What this vertical calls one feature, and where the sidebar puts it.
 *
 * Every field is optional and BLANK MEANS INHERIT, not empty: null in
 * `industry_features` is how the resolver reads "use the feature's own name,
 * noun and sort order", column by column. The action turns a blank string
 * into null for that reason — storing '' would rename the feature to nothing.
 *
 * The sort order is posted as a string like every other input; the action
 * parses it. Six digits is well inside a Postgres integer and far past the
 * multiples-of-100 convention the sidebar orders by.
 */
export const industryNamingSchema = z.object({
	featureId: z.string().trim().min(1),
	name: z.string().trim().max(60, 'Keep the name under 60 characters.').optional(),
	noun: z.string().trim().max(60, 'Keep the noun under 60 characters.').optional(),
	sortOrder: z
		.string()
		.trim()
		.regex(/^\d{0,6}$/, 'Use a whole number, or leave it blank to inherit.')
		.optional()
});
