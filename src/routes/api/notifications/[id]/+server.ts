import { error, json } from '@sveltejs/kit';
import { updateNotificationSchema } from '$lib/schemas/notifications';
import { updateNotification } from '$lib/server/crm/notifications';
import { notificationColumns } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

/**
 * Read, unread, dismiss or restore one notification — the other half of
 * `/api/notifications`, and every change a recipient is allowed to make to a
 * row (the column grants reach `read_at` and `archived_at` and nothing else).
 *
 * No org id and no membership check: the policies are `user_id = auth.uid()`,
 * so a caller can only ever name their own notification, and one they cannot
 * see comes back from `.single()` as a row that is not there. That is a 400
 * and not a 500 — it is the caller's id that is wrong, not the server.
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const parsed = updateNotificationSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'That notification could not be updated.');
	}

	try {
		return json(
			await updateNotification(locals.supabase, params.id, notificationColumns(parsed.data))
		);
	} catch (cause) {
		throw error(
			400,
			cause instanceof Error ? cause.message : 'That notification could not be updated.'
		);
	}
};
