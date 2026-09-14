import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
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

/**
 * Who is behind a notification, as the panel draws them: a face and a name.
 * Null for the ones the system raises itself, which have no actor and read
 * as a statement rather than as somebody's doing.
 */
export type NotificationActor = Pick<Tables<'profiles'>, 'id' | 'display_name' | 'avatar_url'>;

/** One row as every surface that lists notifications wants it: with its actor. */
export type InboxNotification = AppNotification & { actor: NotificationActor | null };

/**
 * Which slice of the inbox to fetch. `archived` is tri-state on purpose:
 * omitting it means both piles, which is what a count over everything wants,
 * while the panel asks for one at a time so each gets its own cap.
 */
export type NotificationFilter = {
	/** `false` for the rows still in the list, `true` for the ones put away, omitted for both. */
	archived?: boolean;
	channel?: Database['public']['Enums']['notification_channel'];
	unreadOnly?: boolean;
	limit?: number;
};

/**
 * The actor embed, by constraint name rather than by table. `notifications`
 * points at `organization_members` as well, which points at `profiles` — a
 * bare `profiles(...)` is the kind of thing PostgREST answers with PGRST201
 * (the ambiguity the organizations query in `org-context.ts` ran into), and
 * naming the foreign key costs nothing and cannot become ambiguous later.
 */
const WITH_ACTOR = '*, actor:profiles!notifications_actor_id_fkey (id, display_name, avatar_url)';

export async function listNotifications(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: NotificationFilter = {}
): Promise<InboxNotification[]> {
	let query = supabase
		.from('notifications')
		.select(WITH_ACTOR)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false })
		.limit(filter.limit ?? 50);
	if (filter.unreadOnly) query = query.is('read_at', null);
	if (filter.channel) query = query.eq('channel', filter.channel);
	if (filter.archived === false) query = query.is('archived_at', null);
	if (filter.archived === true) query = query.not('archived_at', 'is', null);
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
		.is('read_at', null)
		// A notification the reader put away is done with, however unread it
		// is — the same rule `unreadIn()` applies in the panel.
		.is('archived_at', null);
	ensure(response);
	return response.count ?? 0;
}

/**
 * Read, unread, put away, taken back out — every change a recipient can make
 * to one notification, through one write. There is no more to change: the
 * column grants let `authenticated` update `read_at` and `archived_at` and
 * nothing else, so a second writer here would only be a second way to set the
 * same two columns. What the two timestamps MEAN together is
 * `notificationColumns()` in `$lib/server/notifications`, which is where a
 * request body becomes them.
 */
export async function updateNotification(
	supabase: SupabaseClient<Database>,
	notificationId: string,
	columns: TablesUpdate<'notifications'>
): Promise<AppNotification> {
	return unwrap(
		await supabase.from('notifications').update(columns).eq('id', notificationId).select().single()
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
 *
 * The columns the notification_inbox migration added are all optional here: a
 * caller that names none of them writes the notification it always wrote —
 * an `inbox` row, actor-less, with nothing to do about it. Set `actor_id`
 * when a person did the thing (the panel puts their name in front of the
 * title, so write `title` as the rest of the sentence: 'assigned you a
 * ticket'), and `action_label` only alongside a `link` — the row's button
 * goes there, and the database refuses the pair without it.
 */
export async function createNotification(
	serviceRole: SupabaseClient<Database>,
	values: Pick<
		TablesInsert<'notifications'>,
		| 'org_id'
		| 'user_id'
		| 'type'
		| 'title'
		| 'body'
		| 'link'
		| 'actor_id'
		| 'channel'
		| 'context'
		| 'action_label'
	>
): Promise<AppNotification> {
	return unwrap(await serviceRole.from('notifications').insert(values).select().single());
}
