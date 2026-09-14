import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import { refreshAccessToken } from '$lib/server/integrations/google/oauth';
import { createNotification } from '$lib/server/crm/notifications';
import { ensure, unwrap } from '$lib/server/crm/unwrap';
import type { MailSyncConfig } from './config';
import type { MailboxRow } from './ingest';
import { openSecret, sealSecret } from './tokens';

/**
 * A usable access token for a mailbox, or the reason there is none.
 *
 * The sealed access token is reused while it has a minute left; otherwise
 * the sealed refresh token buys a new one, which is sealed and stored for
 * the next call. Google answering `invalid_grant` means the grant is gone —
 * revoked by the user, expired by an app still in Testing status, or the
 * password changed — and no retry will help: the mailbox is marked
 * `reauthorize`, its owner is told, and every job for it stops until they
 * connect again.
 */

export type AccessToken =
	| { ok: true; token: string }
	| { ok: false; reason: 'reauthorize' | 'missing' | 'error'; error: string };

/** Refresh when this little of the token's life is left. */
const REFRESH_MARGIN_MS = 60 * 1000;

export async function accessTokenFor(
	admin: SupabaseClient<Database>,
	mailbox: MailboxRow,
	config: MailSyncConfig,
	deps: { fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<AccessToken> {
	const now = deps.now ?? (() => new Date());
	const rows = unwrap(
		await admin
			.from('mailbox_credentials')
			.select('refresh_token_sealed, access_token_sealed, access_token_expires_at')
			.eq('mailbox_id', mailbox.id)
			.limit(1)
	);
	const credentials = rows[0];
	if (!credentials) return { ok: false, reason: 'missing', error: 'No credentials stored.' };

	if (credentials.access_token_sealed && credentials.access_token_expires_at) {
		const expiresAt = Date.parse(credentials.access_token_expires_at);
		if (expiresAt - now().getTime() > REFRESH_MARGIN_MS) {
			const token = openSecret(credentials.access_token_sealed, config.key);
			if (token) return { ok: true, token };
		}
	}

	const refreshToken = openSecret(credentials.refresh_token_sealed, config.key);
	if (!refreshToken) {
		await markReauthorize(admin, mailbox, 'The stored token could not be read.');
		return { ok: false, reason: 'reauthorize', error: 'The stored token could not be read.' };
	}

	const refreshed = await refreshAccessToken(config.oauth, refreshToken, {
		fetchImpl: deps.fetchImpl,
		now
	});
	if (!refreshed.ok) {
		if (refreshed.code === 'invalid_grant') {
			await markReauthorize(admin, mailbox, refreshed.error);
			return { ok: false, reason: 'reauthorize', error: refreshed.error };
		}
		return { ok: false, reason: 'error', error: refreshed.error };
	}

	const renewed: Partial<Tables<'mailbox_credentials'>> = {
		access_token_sealed: sealSecret(refreshed.accessToken, config.key),
		access_token_expires_at: refreshed.expiresAt
	};
	// Google occasionally rotates the refresh token on refresh.
	if (refreshed.refreshToken) {
		renewed.refresh_token_sealed = sealSecret(refreshed.refreshToken, config.key);
	}
	ensure(await admin.from('mailbox_credentials').update(renewed).eq('mailbox_id', mailbox.id));
	return { ok: true, token: refreshed.accessToken };
}

/**
 * The grant is gone. Stop syncing, say why on the row, and tell the owner
 * where to reconnect — once: a mailbox already in this state is not
 * notified again on every job that finds it.
 */
export async function markReauthorize(
	admin: SupabaseClient<Database>,
	mailbox: MailboxRow,
	reason: string
): Promise<void> {
	if (mailbox.status === 'reauthorize') return;
	ensure(
		await admin
			.from('mailboxes')
			.update({ status: 'reauthorize', last_error: reason.slice(0, 500) })
			.eq('id', mailbox.id)
	);
	await createNotification(admin, {
		org_id: mailbox.org_id,
		user_id: mailbox.user_id,
		type: 'mailbox_reauthorize',
		title: `Reconnect ${mailbox.email_address}`,
		body: 'Google stopped accepting the connection, so this mailbox is no longer syncing. Connect it again to resume.',
		link: '/settings/integrations'
	});
}
