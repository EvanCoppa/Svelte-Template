import { z } from 'zod';
import { CATALOG_KEY, CATALOG_KEY_MESSAGE } from '$lib/admin/keys';

/**
 * Add a vertical.
 *
 * The id is the key `organizations.industry_id`, `roles.industry_id` and
 * `industry_features` all point at, so it is chosen once here and never
 * edited — and it is validated against the same shape the `[id=key]` matcher
 * enforces, or the new vertical would be a row whose own page 404s.
 */
export const createIndustrySchema = z.object({
	id: z.string().trim().regex(CATALOG_KEY, CATALOG_KEY_MESSAGE),
	name: z.string().trim().min(1, 'Name the vertical.').max(60, 'Keep the name under 60 characters.')
});
