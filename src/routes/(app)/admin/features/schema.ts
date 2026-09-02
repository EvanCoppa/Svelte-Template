import { z } from 'zod';
import { NAV_CATEGORIES } from '$lib/navigation';

/**
 * The registry's editable columns. `id` and `route` are the contract with
 * the code (FEATURE_IDS, the route folder) and stay read-only; adding a
 * feature is still a migration.
 */
export const catalogSchema = z.object({
	features: z.array(
		z.object({
			id: z.string().min(1),
			name: z
				.string()
				.trim()
				.min(1, 'Every feature needs a name.')
				.max(80, 'Keep names under 80 characters.'),
			description: z.string().trim().max(300, 'Keep descriptions under 300 characters.'),
			icon: z.string(),
			category: z
				.string()
				.refine(
					(value) => NAV_CATEGORIES.some((category) => category.key === value),
					'Pick a sidebar section.'
				),
			sort_order: z.number().int().min(0).max(9999)
		})
	)
});

/** The checked cells of the two matrices, as `feature|industry` and `feature|tier` pairs. */
export const availabilitySchema = z.object({
	industries: z.array(z.string()).default([]),
	tiers: z.array(z.string()).default([])
});
