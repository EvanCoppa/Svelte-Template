import { z } from 'zod';

/**
 * The one mutation the platform area has: move an organization to another
 * plan. A tier id is a text key (`free`, `pro`, …), not a uuid, so the shape
 * check is only that something was picked — the action checks the id against
 * the tiers table for a friendly message, and the foreign key is the
 * backstop behind that.
 */
export const setTierSchema = z.object({
	tierId: z.string().trim().min(1, 'Pick a plan.')
});
