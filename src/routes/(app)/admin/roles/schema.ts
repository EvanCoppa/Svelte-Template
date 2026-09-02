import { z } from 'zod';

/** The ladder plus "no grant" — what one cell of the role × feature grid holds. */
export const GRANT_LEVELS = ['none', 'read', 'manage', 'delete'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export function isGrantLevel(value: string): value is GrantLevel {
	return GRANT_LEVELS.some((level) => level === value);
}

/** Every role × feature cell of one industry's grid, 'none' where nothing is granted. */
export const grantsSchema = z.object({
	industry_id: z.string().min(1),
	grants: z.array(
		z.object({
			role_id: z.uuid(),
			feature_id: z.string().min(1),
			level: z.enum(GRANT_LEVELS)
		})
	)
});

export const createRoleSchema = z.object({
	industry_id: z.string().min(1),
	name: z
		.string()
		.trim()
		.min(1, 'Give the role a name.')
		.max(60, 'Keep role names under 60 characters.'),
	description: z.string().trim().max(200, 'Keep descriptions under 200 characters.')
});

export const deleteRoleSchema = z.object({
	role_id: z.uuid()
});
