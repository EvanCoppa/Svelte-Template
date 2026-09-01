import { describe, expect, it } from 'vitest';
import {
	createNotification,
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadNotificationCount
} from './notifications';
import { ORG_ID, supabaseMock } from './test-support';

const NOTIFICATION_ID = '90000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

describe('notifications data access', () => {
	it('lists the inbox for the active org, newest first, capped', async () => {
		const rows = [{ id: NOTIFICATION_ID, title: 'Ticket assigned to you' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listNotifications(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('notifications');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(builder.limit).toHaveBeenCalledWith(50);
	});

	it('narrows to unread rows when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listNotifications(supabase, ORG_ID, { unreadOnly: true, limit: 10 });
		expect(builder.is).toHaveBeenCalledWith('read_at', null);
		expect(builder.limit).toHaveBeenCalledWith(10);
	});

	it('counts unread without fetching rows', async () => {
		const { supabase, builder } = supabaseMock({ count: 3 });

		await expect(unreadNotificationCount(supabase, ORG_ID)).resolves.toBe(3);
		expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
		expect(builder.is).toHaveBeenCalledWith('read_at', null);
	});

	it('treats a missing count as zero', async () => {
		const { supabase } = supabaseMock({ count: null });

		await expect(unreadNotificationCount(supabase, ORG_ID)).resolves.toBe(0);
	});

	it('marks one notification read with a timestamp', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: NOTIFICATION_ID } });

		await markNotificationRead(supabase, NOTIFICATION_ID);
		expect(builder.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
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
			type: 'ticket_assigned',
			title: 'Ticket assigned to you',
			link: '/tickets'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			user_id: USER_ID,
			type: 'ticket_assigned',
			title: 'Ticket assigned to you',
			link: '/tickets'
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
