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

/**
 * Ids come back from the database, so they are validated with `z.guid()`
 * rather than `z.uuid()` — same reason as `PUT /api/org`. A Postgres uuid is
 * any 8-4-4-4-12 hex value, while `z.uuid()` enforces RFC 4122 version bits
 * that the role ids shipped by the roles_permissions migration
 * (`b0000000-…`) and the seed's fixed user ids do not carry: assigning a
 * built-in role would fail validation before it ever reached RLS.
 */

export const revokeInviteSchema = z.object({
	invite_id: z.guid()
});

export const assignRoleSchema = z.object({
	user_id: z.guid(),
	role_id: z.guid('Choose a role to assign.')
});

export const unassignRoleSchema = z.object({
	user_id: z.guid(),
	role_id: z.guid()
});

export const removeMemberSchema = z.object({
	user_id: z.guid()
});
