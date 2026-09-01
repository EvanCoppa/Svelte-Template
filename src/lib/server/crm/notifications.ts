import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert } from '$lib/database.types';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `notifications`.
 *
 * Reads and read-marking run on the request-scoped client — RLS already
 * scopes every row to the signed-in user, the org filter just keeps the
 * inbox showing the org being looked at. Creation is different: the table
 * deliberately has no INSERT policy, so `createNotification` requires the
 * service-role client (`src/lib/supabase.server.ts`), created per request in
 * server files only — call it from the form action or endpoint that caused
 * the notification.
 */

export type AppNotification = Tables<'notifications'>;

export async function listNotifications(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { unreadOnly?: boolean; limit?: number } = {}
): Promise<AppNotification[]> {
	let query = supabase
		.from('notifications')
		.select('*')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false })
		.limit(filter.limit ?? 50);
	if (filter.unreadOnly) query = query.is('read_at', null);
	return unwrap(await query);
}

/** Unread-badge count for the active org, without fetching rows. */
export async function unreadNotificationCount(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<number> {
	const response = await supabase
		.from('notifications')
		.select('*', { count: 'exact', head: true })
		.eq('org_id', orgId)
		.is('read_at', null);
	ensure(response);
	return response.count ?? 0;
}

export async function markNotificationRead(
	supabase: SupabaseClient<Database>,
	notificationId: string
): Promise<AppNotification> {
	return unwrap(
		await supabase
			.from('notifications')
			.update({ read_at: new Date().toISOString() })
			.eq('id', notificationId)
			.select()
			.single()
	);
}

export async function markAllNotificationsRead(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<void> {
	ensure(
		await supabase
			.from('notifications')
			.update({ read_at: new Date().toISOString() })
			.eq('org_id', orgId)
			.is('read_at', null)
	);
}

export async function deleteNotification(
	supabase: SupabaseClient<Database>,
	notificationId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('notifications').delete().eq('id', notificationId).select('id'),
		'Notification'
	);
}

/**
 * Creates a notification for one member. `serviceRole` MUST be the
 * service-role client (`createSupabaseAdminClient()`) — the request-scoped
 * one has no INSERT policy and will be rejected by RLS. The recipient must
 * be a member of `org_id` and `link` must be app-relative ('/tickets/…');
 * the schema rejects both violations.
 */
export async function createNotification(
	serviceRole: SupabaseClient<Database>,
	values: Pick<
		TablesInsert<'notifications'>,
		'org_id' | 'user_id' | 'type' | 'title' | 'body' | 'link'
	>
): Promise<AppNotification> {
	return unwrap(await serviceRole.from('notifications').insert(values).select().single());
}
