import { z } from 'zod';

/** Rename a plan. Its id, which everything points at, is not editable. */
export const renameTierSchema = z.object({
	name: z.string().trim().min(1, 'Name the plan.').max(60, 'Keep the name under 60 characters.')
});

/**
 * Exactly which features this plan unlocks — the ids the operator wants ON,
 * with everything unlisted turned off. The same shape the organization's own
 * feature settings post (`featuresSchema`), because it is the same question
 * asked one axis up.
 */
export const tierFeaturesSchema = z.object({
	featureIds: z.array(z.string()).default([])
});
