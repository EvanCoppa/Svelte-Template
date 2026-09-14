import { toast } from 'svelte-sonner';
import { z } from 'zod';
import { invalidate } from '$app/navigation';
import { QUERY } from '$lib/queries';
import type { UpdateNotificationBody } from '$lib/schemas/notifications';

/**
 * The browser's half of the notifications API (`src/routes/api/notifications`).
 *
 * Built exactly like `$lib/notes-api`, and for the same reason: the bell hangs
 * off the app header, so there is no page action to post to and no form to
 * post — CLAUDE.md's cross-page-mutation exception. One endpoint pair, reached
 * only through `notificationCommands` below, is what keeps that a single
 * mechanism instead of one per surface.
 */

/** Throws the endpoint's own message, so a refusal reads as one in a toast. */
async function request(url: string, body: UpdateNotificationBody): Promise<Response> {
	const response = await fetch(url, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		throw new Error(await errorMessage(response));
	}
	return response;
}

/** What SvelteKit's `error()` answers with; anything else is not one of ours. */
const errorBody = z.object({ message: z.string() });

async function errorMessage(response: Response): Promise<string> {
	const parsed = errorBody.safeParse(await response.json().catch(() => null));
	return parsed.success ? parsed.data.message : `That did not save (${String(response.status)}).`;
}

/**
 * The three things the panel does, with the refresh and the error report
 * already in them.
 *
 * All three are deliberately silent on success. A toast exists to report
 * something you cannot see for yourself, and every one of these is visible in
 * the panel the moment `QUERY.notifications` comes back: the tint leaves the
 * row, the row moves to Archived, the counts drop. Only failures interrupt.
 */
export const notificationCommands = {
	/** Seen. Sent when a notification is opened, not when it is merely on screen. */
	markRead: (id: string) => patch(`/api/notifications/${id}`, { read: true }),
	/** Put away, or taken back out. Dismissing marks it read too — the server's rule. */
	archive: (id: string, archived: boolean) => patch(`/api/notifications/${id}`, { archived }),
	/** Every unread notification in the active organization, in one write. */
	markAllRead: () => patch('/api/notifications', { read: true })
};

async function patch(url: string, body: UpdateNotificationBody): Promise<boolean> {
	try {
		await request(url, body);
		// One key, invalidated at the event source: the shell's load owns the
		// inbox, so this is what redraws the panel, the tab counts and the dot
		// on the bell together (docs/data-invalidation.md).
		await invalidate(QUERY.notifications);
		return true;
	} catch (cause) {
		toast.error(cause instanceof Error ? cause.message : 'That notification could not be updated.');
		return false;
	}
}
