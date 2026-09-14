import { describe, expect, it } from 'vitest';
import {
	createNotification,
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	unreadNotificationCount,
	updateNotification
} from './notifications';
import { ORG_ID, supabaseMock } from './test-support';

const NOTIFICATION_ID = '90000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

describe('notifications data access', () => {
	it('lists the inbox for the active org, newest first, capped', async () => {
		const rows = [{ id: NOTIFICATION_ID, title: 'assigned you a ticket' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listNotifications(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('notifications');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(builder.limit).toHaveBeenCalledWith(50);
	});

	it('embeds the actor by its foreign key, never by table name', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotifications(supabase, ORG_ID);
		// A bare `profiles(...)` is ambiguous to PostgREST here — notifications
		// reaches profiles through organization_members as well.
		expect(builder.select).toHaveBeenCalledWith(
			expect.stringContaining('profiles!notifications_actor_id_fkey')
		);
	});

	it('narrows to unread rows when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotifications(supabase, ORG_ID, { unreadOnly: true, limit: 10 });
		expect(builder.is).toHaveBeenCalledWith('read_at', null);
		expect(builder.limit).toHaveBeenCalledWith(10);
	});

	it('narrows to one channel when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotifications(supabase, ORG_ID, { channel: 'general' });
		expect(builder.eq).toHaveBeenCalledWith('channel', 'general');
	});

	it('splits the two archive states, and asks for neither when told nothing', async () => {
		const open = supabaseMock({ data: [] });
		await listNotifications(open.supabase, ORG_ID, { archived: false });
		expect(open.builder.is).toHaveBeenCalledWith('archived_at', null);

		const dismissed = supabaseMock({ data: [] });
		await listNotifications(dismissed.supabase, ORG_ID, { archived: true });
		expect(dismissed.builder.not).toHaveBeenCalledWith('archived_at', 'is', null);

		const both = supabaseMock({ data: [] });
		await listNotifications(both.supabase, ORG_ID);
		expect(both.builder.is).not.toHaveBeenCalledWith('archived_at', null);
		expect(both.builder.not).not.toHaveBeenCalled();
	});

	it('counts unread without fetching rows, and never counts a dismissed one', async () => {
		const { supabase, builder } = supabaseMock({ count: 3 });

		await expect(unreadNotificationCount(supabase, ORG_ID)).resolves.toBe(3);
		expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
		expect(builder.is).toHaveBeenCalledWith('read_at', null);
		expect(builder.is).toHaveBeenCalledWith('archived_at', null);
	});

	it('treats a missing count as zero', async () => {
		const { supabase } = supabaseMock({ count: null });

		await expect(unreadNotificationCount(supabase, ORG_ID)).resolves.toBe(0);
	});

	it('writes exactly the columns it was handed, to the named row', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTIFICATION_ID } });

		await updateNotification(supabase, NOTIFICATION_ID, { read_at: '2026-09-18T09:00:00.000Z' });
		expect(builder.update).toHaveBeenCalledWith({ read_at: '2026-09-18T09:00:00.000Z' });
		expect(builder.eq).toHaveBeenCalledWith('id', NOTIFICATION_ID);
	});

	it('marks all read only for unread rows in the org', async () => {
		const { supabase, builder } = supabaseMock({});

		await markAllNotificationsRead(supabase, ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.is).toHaveBeenCalledWith('read_at', null);
	});

	it('creates a notification through the service-role client verbatim', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTIFICATION_ID } });

		await createNotification(supabase, {
			org_id: ORG_ID,
			user_id: USER_ID,
			actor_id: '00000000-0000-0000-0000-000000000003',
			channel: 'inbox',
			type: 'ticket_assigned',
			title: 'assigned you a ticket',
			context: 'Support',
			link: '/tickets',
			action_label: 'Review'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			user_id: USER_ID,
			actor_id: '00000000-0000-0000-0000-000000000003',
			channel: 'inbox',
			type: 'ticket_assigned',
			title: 'assigned you a ticket',
			context: 'Support',
			link: '/tickets',
			action_label: 'Review'
		});
	});

	it('deletes with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: NOTIFICATION_ID }] });
		await deleteNotification(deleted.supabase, NOTIFICATION_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', NOTIFICATION_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteNotification(filtered.supabase, NOTIFICATION_ID)).rejects.toThrow(
			'Notification was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'permission denied' } });

		await expect(
			createNotification(supabase, {
				org_id: ORG_ID,
				user_id: USER_ID,
				type: 'x',
				title: 'x'
			})
		).rejects.toThrow('permission denied');
	});
});
