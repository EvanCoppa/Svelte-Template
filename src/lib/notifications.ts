import type { Enums } from '$lib/database.types';
import type { InboxNotification } from '$lib/server/crm/notifications';

/**
 * What the bell's panel knows on its own: which pile a notification falls in,
 * what its timestamp reads as, and how many are still unread.
 *
 * Pure and local, for the reason `taskBucket()` and `dueLabel()` are
 * (docs/tasks.md): "36 minutes ago" is a wall-clock phrase, and the server
 * that rendered the page may have been asked for it a minute — or, on a
 * prerendered shell, an hour — before the reader looked at it. So the server
 * ships instants and the browser turns them into words, with `now` passed in
 * rather than read, so the same call is the same answer on both sides of
 * hydration and a test can say when "now" is.
 */

export type NotificationChannel = Enums<'notification_channel'>;

/**
 * The panel's three piles. Two of them are the `channel` column; the third is
 * the archive state, which cuts across both — a general notification you put
 * away is in Archived, not in General.
 */
export type NotificationTab = NotificationChannel | 'archived';

export const NOTIFICATION_TABS = [
	{
		id: 'inbox',
		label: 'Inbox',
		/** What the tab says when it holds nothing. */
		empty: 'Nothing needs you right now.'
	},
	{ id: 'general', label: 'General', empty: 'No activity from your organization yet.' },
	{ id: 'archived', label: 'Archived', empty: 'Notifications you dismiss are kept here.' }
] as const satisfies readonly { id: NotificationTab; label: string; empty: string }[];

/** Which pile one notification is in. Archived wins over the channel it came in on. */
export function notificationTab(notification: InboxNotification): NotificationTab {
	return notification.archived_at ? 'archived' : notification.channel;
}

/** The notifications in one pile, in the order the server sent them (newest first). */
export function notificationsIn(
	notifications: readonly InboxNotification[],
	tab: NotificationTab
): InboxNotification[] {
	return notifications.filter((notification) => notificationTab(notification) === tab);
}

/**
 * Unread in one pile. Archived rows never count however unread they are:
 * putting one away is the reader saying they are done with it, and a badge
 * that outlives the dismissal is a badge people learn to ignore.
 */
export function unreadIn(
	notifications: readonly InboxNotification[],
	tab: NotificationTab
): number {
	if (tab === 'archived') return 0;
	return notificationsIn(notifications, tab).filter((notification) => !notification.read_at).length;
}

/**
 * What the dot on the bell is counting: the unread in every pile the reader
 * can actually open. `tabs` is passed rather than assumed because the General
 * stream is an account preference — a reader who switched it off should not be
 * nagged by a count for a tab that is not on screen (docs/user-preferences.md).
 */
export function unreadTotal(
	notifications: readonly InboxNotification[],
	tabs: readonly NotificationTab[]
): number {
	return tabs.reduce((total, tab) => total + unreadIn(notifications, tab), 0);
}

// ---------------------------------------------------------------------------
// Words for a timestamp
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past a week the elapsed time stops meaning anything and the date is shorter. */
const NAMED_DAYS = 7;

const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * How long ago, in as few words as carry it. Deliberately coarse: the exact
 * minute of a notification is never the point, and rounding down ("2 hours
 * ago" from 2h59m) is how every activity stream reads.
 */
export function timeAgo(instant: string, now: Date): string {
	const then = new Date(instant);
	const elapsed = now.getTime() - then.getTime();
	// A clock that disagrees with the server's, or a row written in the same
	// second: either way "in 4 seconds" helps nobody.
	if (elapsed < MINUTE) return 'Just now';
	if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'min');
	if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
	if (elapsed < NAMED_DAYS * DAY) return plural(Math.floor(elapsed / DAY), 'day');
	return monthDay.format(then);
}

function plural(count: number, unit: string): string {
	return `${String(count)} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * The line under a notification: how long ago, and the sender's own word for
 * what it is about when there is one — "36 mins ago · Risk".
 */
export function notificationMeta(notification: InboxNotification, now: Date): string {
	const ago = timeAgo(notification.created_at, now);
	return notification.context ? `${ago} · ${notification.context}` : ago;
}

/**
 * The name in front of the title, when a person is behind the notification.
 * A profile with no display name yet falls back to nothing rather than to an
 * email: the sentence reads fine without a subject ("Invoice INV-1002 is past
 * its due date"), and an address in the middle of one does not.
 */
export function actorName(notification: InboxNotification): string | null {
	const name = notification.actor?.display_name?.trim();
	return name ? name : null;
}
