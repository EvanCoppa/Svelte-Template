import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { parsePushBody, pushConfig, verifyPushToken } from '$lib/server/integrations/google/pubsub';
import { isMailSyncConfigured } from '$lib/server/mail-sync/config';
import { enqueueIncrementalFor } from '$lib/server/mail-sync/worker';
import type { RequestHandler } from './$types';

/**
 * Gmail's push notifications, delivered by a Cloud Pub/Sub push
 * subscription. A public path (no session — Google is calling) with its own
 * bearer: the OIDC token Pub/Sub signs for the subscription's service
 * account, verified against Google's keys before the body is read.
 *
 * The notification says only WHICH mailbox changed; the change itself is
 * read by an incremental job, queued here (one per pending mailbox, whatever
 * the burst) and run by the next cron tick. Acknowledged at once with a 204:
 * Pub/Sub retries anything else, and a malformed message would retry
 * forever, so it is logged and acknowledged too.
 */
export const POST: RequestHandler = async ({ request }) => {
	const push = pushConfig();
	if (!push || !isMailSyncConfigured()) throw error(503, 'Push notifications are not configured.');

	const verified = await verifyPushToken(request.headers.get('authorization'), push);
	if (!verified.ok) throw error(401, 'Not a Pub/Sub delivery this app accepts.');

	const body = parsePushBody(await request.json().catch(() => null));
	if (!body) {
		console.warn('[mail-sync] push notification with no readable body');
		return new Response(null, { status: 204 });
	}

	await enqueueIncrementalFor(createSupabaseAdminClient(), body.emailAddress);
	return new Response(null, { status: 204 });
};
