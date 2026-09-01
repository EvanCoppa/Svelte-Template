import { z } from 'zod';

/**
 * The staff page posts five forms, each with its own schema and action. The
 * id-only ones look thin, but going through superforms keeps every mutation
 * on the same road: validated server-side, `fail(400, { form })` on invalid,
 * and `message()` for a failure the user should read.
 */

export const inviteSchema = z.object({
	email: z.email('Enter a valid email address.').trim().toLowerCase()
});

/** The "Copy invite link" button — a link invite carries no address. */
export const inviteLinkSchema = z.object({});

export const revokeInviteSchema = z.object({
	invite_id: z.uuid()
});

export const assignRoleSchema = z.object({
	user_id: z.uuid(),
	role_id: z.uuid('Choose a role to assign.')
});

export const unassignRoleSchema = z.object({
	user_id: z.uuid(),
	role_id: z.uuid()
});

export const removeMemberSchema = z.object({
	user_id: z.uuid()
});
