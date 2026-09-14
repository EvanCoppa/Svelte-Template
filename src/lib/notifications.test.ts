import { describe, expect, it } from 'vitest';
import {
	actorName,
	notificationMeta,
	notificationTab,
	notificationsIn,
	timeAgo,
	unreadIn,
	unreadTotal
} from './notifications';
import type { InboxNotification } from '$lib/server/crm/notifications';

const NOW = new Date('2026-09-18T12:00:00.000Z');

function ago(ms: number): string {
	return new Date(NOW.getTime() - ms).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function notification(overrides: Partial<InboxNotification> = {}): InboxNotification {
	return {
		id: crypto.randomUUID(),
		org_id: '10000000-0000-0000-0000-000000000001',
		user_id: '00000000-0000-0000-0000-000000000001',
		actor_id: null,
		channel: 'inbox',
		type: 'ticket_assigned',
		title: 'assigned you a ticket',
		body: null,
		context: null,
		link: '/tickets',
		action_label: null,
		created_at: ago(MINUTE * 5),
		read_at: null,
		archived_at: null,
		actor: null,
		...overrides
	};
}

describe('which pile a notification is in', () => {
	it('files an open one by its channel', () => {
		expect(notificationTab(notification({ channel: 'inbox' }))).toBe('inbox');
		expect(notificationTab(notification({ channel: 'general' }))).toBe('general');
	});

	it('files a dismissed one as archived, whatever channel it came in on', () => {
		const row = notification({ channel: 'general', archived_at: ago(DAY) });
		expect(notificationTab(row)).toBe('archived');
	});

	it('keeps the server order within a pile', () => {
		const newest = notification({ channel: 'inbox', created_at: ago(MINUTE) });
		const older = notification({ channel: 'inbox', created_at: ago(HOUR) });
		const other = notification({ channel: 'general' });

		expect(notificationsIn([newest, older, other], 'inbox')).toEqual([newest, older]);
		expect(notificationsIn([newest, older, other], 'general')).toEqual([other]);
	});
});

describe('unread counts', () => {
	const rows = [
		notification({ channel: 'inbox' }),
		notification({ channel: 'inbox', read_at: ago(MINUTE) }),
		notification({ channel: 'general' }),
		notification({ channel: 'general' }),
		// Dismissed without ever being opened — read_at is null, and it still
		// must not show up in a badge.
		notification({ channel: 'inbox', archived_at: ago(DAY) })
	];

	it('counts the unread in one pile', () => {
		expect(unreadIn(rows, 'inbox')).toBe(1);
		expect(unreadIn(rows, 'general')).toBe(2);
	});

	it('never counts the archived pile, however unread its rows are', () => {
		expect(unreadIn(rows, 'archived')).toBe(0);
	});

	it('adds up only the tabs the reader can see', () => {
		expect(unreadTotal(rows, ['inbox', 'general'])).toBe(3);
		// The General tab switched off: its unread stops nagging from the bell.
		expect(unreadTotal(rows, ['inbox'])).toBe(1);
	});
});

describe('how long ago', () => {
	it('says just now inside the first minute, and never says a negative', () => {
		expect(timeAgo(ago(0), NOW)).toBe('Just now');
		expect(timeAgo(ago(59_000), NOW)).toBe('Just now');
		// A browser clock running behind the server's.
		expect(timeAgo(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe('Just now');
	});

	it('counts in minutes, then hours, then days — rounding down', () => {
		expect(timeAgo(ago(MINUTE), NOW)).toBe('1 min ago');
		expect(timeAgo(ago(36 * MINUTE), NOW)).toBe('36 mins ago');
		expect(timeAgo(ago(HOUR), NOW)).toBe('1 hour ago');
		expect(timeAgo(ago(2 * HOUR + 59 * MINUTE), NOW)).toBe('2 hours ago');
		expect(timeAgo(ago(DAY), NOW)).toBe('1 day ago');
		expect(timeAgo(ago(6 * DAY), NOW)).toBe('6 days ago');
	});

	it('gives up on elapsed time after a week and prints the date', () => {
		expect(timeAgo(ago(8 * DAY), NOW)).not.toContain('ago');
	});
});

describe('the line under a notification', () => {
	it('is the time alone when the sender named no context', () => {
		expect(notificationMeta(notification({ created_at: ago(2 * HOUR) }), NOW)).toBe('2 hours ago');
	});

	it('adds the word the sender chose when there is one', () => {
		const row = notification({ created_at: ago(36 * MINUTE), context: 'Risk' });
		expect(notificationMeta(row, NOW)).toBe('36 mins ago · Risk');
	});
});

describe('the name in front of the title', () => {
	const actor = { id: '00000000-0000-0000-0000-000000000003', avatar_url: null };

	it('is the actor display name when there is one', () => {
		const row = notification({ actor: { ...actor, display_name: 'Evan Coppa' } });
		expect(actorName(row)).toBe('Evan Coppa');
	});

	it('is nothing at all for a notification the system raised', () => {
		expect(actorName(notification())).toBeNull();
	});

	it('is nothing rather than a blank for a profile with no name yet', () => {
		const row = notification({ actor: { ...actor, display_name: '   ' } });
		expect(actorName(row)).toBeNull();
	});
});
