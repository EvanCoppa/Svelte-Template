import { z } from 'zod';
import { CATALOG_KEY, CATALOG_KEY_MESSAGE } from '$lib/admin/keys';

/**
 * Add a plan.
 *
 * The id is the key `tier_features` and `organizations.tier_id` point at, so
 * it is chosen once here and never edited afterwards — and it is validated
 * against the same shape the `[id=key]` matcher enforces, or the new plan
 * would be a row whose own page 404s.
 */
export const createTierSchema = z.object({
	id: z.string().trim().regex(CATALOG_KEY, CATALOG_KEY_MESSAGE),
	name: z.string().trim().min(1, 'Name the plan.').max(60, 'Keep the name under 60 characters.')
});
