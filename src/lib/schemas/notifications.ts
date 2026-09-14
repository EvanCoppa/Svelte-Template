import { z } from 'zod';

/**
 * The bodies `/api/notifications` accepts.
 *
 * Not superforms schemas, for the same reason the notes ones are not: there
 * is no form. The bell hangs off the app header on every screen, so reading,
 * dismissing and restoring a notification are cross-page mutations with
 * nothing to post to — CLAUDE.md's endpoint exception (see
 * `$lib/server/notifications` for the whole argument). Both route files
 * validate with these, so what the browser may write is stated once.
 */

/**
 * Both halves of "I am done with this", each a boolean up here and a
 * timestamp in the column. Only what the caller sends is written, so the two
 * buttons on a row never overwrite each other's column with a stale copy.
 */
export const updateNotificationSchema = z
	.object({
		read: z.boolean().optional(),
		archived: z.boolean().optional()
	})
	.refine((value) => value.read !== undefined || value.archived !== undefined, {
		error: 'Say what to change about that notification.'
	});

/** A patch, as `notificationColumns()` in `$lib/server/notifications` turns it into columns. */
export type UpdateNotificationBody = z.infer<typeof updateNotificationSchema>;

/**
 * "Mark all as read", and only that. A literal rather than a boolean: there
 * is no such thing as marking everything unread again, so the endpoint should
 * refuse `{ read: false }` rather than quietly ignore it.
 */
export const markAllReadSchema = z.object({ read: z.literal(true) });
