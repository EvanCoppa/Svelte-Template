import { z } from 'zod';

/**
 * The four writes this page posts, each with its own schema and action —
 * the same road every mutation in this repo takes, with the operator gate
 * repeated in each action because a POST reaches one with no load in front
 * of it.
 *
 * Nothing here is a security check. An id being well-shaped says nothing
 * about whether it names a row this operator may touch; the actions answer
 * that against the caller's own client, and the foreign keys are the backstop
 * behind that.
 */

/**
 * Move an organization to another plan. A tier id is a text key (`free`,
 * `pro`, …), not a uuid, so the shape check is only that something was
 * picked — the action checks the id against the tiers table for a friendly
 * message.
 */
export const setTierSchema = z.object({
	tierId: z.string().trim().min(1, 'Pick a plan.')
});

/**
 * Rename an organization. The only write in the area that goes through the
 * caller's own client: `name` is the one column `authenticated` may update
 * and an operator is 'owner' everywhere, so RLS carries it.
 */
export const renameSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name the organization.')
		.max(100, 'Keep the name under 100 characters.')
});

/**
 * Move an organization to another vertical — the widest-reaching write here,
 * which is why the page makes the caller confirm the name before it posts.
 */
export const setIndustrySchema = z.object({
	industryId: z.string().trim().min(1, 'Pick a vertical.'),
	/** Typed back by the operator, checked against the organization's name. */
	confirm: z.string().trim().min(1, 'Type the organization name to confirm.')
});

/**
 * The modes an operator may force on one organization. 'disabled' is
 * deliberately absent: the check constraint on
 * `organization_feature_overrides` reserves it for the organization's own
 * opt-out at /settings/features, which is the org's call and not an
 * operator's to make on their behalf.
 */
const OVERRIDE_MODES = ['enabled', 'locked_visible', 'hidden'] as const;

/**
 * The words the page uses for each, in the order it offers them. `satisfies`
 * rather than an annotation, so a mode renamed above fails to compile here
 * instead of quietly leaving an option nobody can pick.
 */
export const OVERRIDE_MODE_OPTIONS = [
	{
		value: 'enabled',
		label: 'Enabled',
		hint: 'On, whatever the plan and the vertical say'
	},
	{
		value: 'locked_visible',
		label: 'Locked',
		hint: 'Shown with a lock, pitching an upgrade'
	},
	{
		value: 'hidden',
		label: 'Hidden',
		hint: 'Does not exist for this organization'
	}
] satisfies { value: (typeof OVERRIDE_MODES)[number]; label: string; hint: string }[];

/** Force one feature to one mode for this organization. */
export const setOverrideSchema = z.object({
	featureId: z.string().trim().min(1, 'Pick a feature.'),
	mode: z.enum(OVERRIDE_MODES),
	/** Why, for whoever finds the row later. Blank is stored as null. */
	note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional()
});

/** Drop an override, returning the feature to what the plan and vertical say. */
export const clearOverrideSchema = z.object({
	featureId: z.string().trim().min(1)
});
