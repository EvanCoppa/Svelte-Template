import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '$lib/database.types';
import type { UpdateNotificationBody } from '$lib/schemas/notifications';
import { listNotifications, type InboxNotification } from './crm/notifications';

/**
 * The server half of the notifications API, and the one read the shell does
 * for the bell.
 *
 * Notifications are NOT a feature. They have no route, no nav entry and no
 * grant: the bell is shell chrome like the theme toggle beside it, and a
 * notification is addressed to a person rather than filed under a capability,
 * so there is nothing for `featureGateFor()` to answer about one — which is
 * why this module has no equivalent of `requireNoteAccess()`. The boundary is
 * the policies: all three `notifications` policies are `user_id =
 * auth.uid()`, and the column grants narrow an update to `read_at` and
 * `archived_at`. A caller reaching `/api/notifications` with someone else's
 * notification id changes nothing and is told the row does not exist, because
 * to them it does not.
 *
 * The org, then, is a filter and never a permission: the active-org cookie
 * says which organization's inbox is on screen, and a forged one yields rows
 * the caller was entitled to anyway (CLAUDE.md, "the active org is a cookie").
 * That is what lets this module take `locals.activeOrgId` directly instead of
 * paying for the org-context round trip the notes endpoints need.
 */

/**
 * How much of the inbox the shell carries. Small on purpose: this is loaded on
 * every navigation, next to the nav, the pages, the vocabulary and the note
 * rail, and a panel is a glance at what is recent rather than an archive
 * browser. The Archived cap is tighter still — it is history, opened by hand.
 */
export const OPEN_NOTIFICATION_LIMIT = 30;
export const ARCHIVED_NOTIFICATION_LIMIT = 15;

/**
 * Everything the panel draws, in one shape: the open notifications newest
 * first, then the archived ones. Two queries rather than one, so each pile
 * gets its own cap — a reader who dismissed two hundred things last month
 * would otherwise push today's out of the window. The panel splits them back
 * apart with `notificationTab()`, which is also what decides which pile a row
 * belongs in after a dismissal, with no reload in between.
 *
 * Both channels are always fetched. Whether the General tab is on screen is
 * an account preference, and hiding a tab hides the tab: the same call is
 * made either way, and the preference decides what is drawn and what the
 * bell counts (docs/user-preferences.md).
 */
export async function loadInbox(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<InboxNotification[]> {
	const [open, archived] = await Promise.all([
		listNotifications(supabase, orgId, { archived: false, limit: OPEN_NOTIFICATION_LIMIT }),
		listNotifications(supabase, orgId, { archived: true, limit: ARCHIVED_NOTIFICATION_LIMIT })
	]);
	return [...open, ...archived];
}

/**
 * The active organization, or a refusal. An endpoint that acts on "everything
 * in this inbox" needs to know which inbox, and the cookie is the only thing
 * that says — a browser that has never been through the `(app)` layout (which
 * is what repairs the cookie) has not seen a bell to press either.
 */
export function requireActiveOrg(activeOrgId: string | null): string {
	if (!activeOrgId) throw error(400, 'No active organization.');
	return activeOrgId;
}

/**
 * What a `PATCH` writes, in the shape `noteColumns()` maps a note's patch:
 * only the fields the browser actually sent, so the two buttons on a row
 * never overwrite each other's column with a stale copy, and each boolean up
 * here becomes the timestamp the column keeps.
 *
 * With one rule on top, which is why this is a function and not a rename:
 * **dismissing marks it read**. Putting something away you never opened still
 * means you are done with it, and leaving `read_at` null would have the row
 * come back into the badge the moment it was restored.
 */
export function notificationColumns(patch: UpdateNotificationBody): TablesUpdate<'notifications'> {
	const now = new Date().toISOString();
	const columns: TablesUpdate<'notifications'> = {};
	if (patch.read !== undefined) columns.read_at = patch.read ? now : null;
	if (patch.archived !== undefined) {
		columns.archived_at = patch.archived ? now : null;
		if (patch.archived) columns.read_at = now;
	}
	return columns;
}
