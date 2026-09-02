import { z } from 'zod';

export const planSchema = z.object({
	industry_id: z.string().min(1, 'Pick an industry.'),
	tier_id: z.string().min(1, 'Pick a plan.')
});

/** An override forces a mode; 'inherit' means let industry and plan decide. */
export const OVERRIDE_CHOICES = ['inherit', 'enabled', 'locked_visible', 'hidden'] as const;
export type OverrideChoice = (typeof OVERRIDE_CHOICES)[number];

export function isOverrideChoice(value: string): value is OverrideChoice {
	return OVERRIDE_CHOICES.some((choice) => choice === value);
}

export const featuresSchema = z.object({
	overrides: z.array(
		z.object({
			feature_id: z.string().min(1),
			mode: z.enum(OVERRIDE_CHOICES)
		})
	),
	/** Feature ids switched off on the org's behalf. */
	disabled: z.array(z.string()).default([])
});

export const ORG_ROLES = ['owner', 'admin', 'member'] as const;

export const memberRoleSchema = z.object({
	user_id: z.uuid(),
	role: z.enum(ORG_ROLES)
});
