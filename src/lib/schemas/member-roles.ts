import { z } from 'zod';

/**
 * Assigning and unassigning a named role to a member — posted from /staff
 * (an owner/admin, through RLS) and from the operator console's
 * organization page (an operator, through the service role). Same shape
 * both places, so it lives here rather than in either route.
 */

export const assignRoleSchema = z.object({
	user_id: z.uuid(),
	role_id: z.uuid('Choose a role to assign.')
});

export const unassignRoleSchema = z.object({
	user_id: z.uuid(),
	role_id: z.uuid()
});
