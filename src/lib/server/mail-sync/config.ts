import { env } from '$env/dynamic/private';
import {
	googleOAuthConfig,
	type GoogleEnv,
	type GoogleOAuthConfig
} from '$lib/server/integrations/google/oauth';
import { tokenKey, type TokenEnv } from './tokens';

/**
 * Whether mail sync is switched on for this deployment, and with what.
 *
 * Entirely env-driven, like email and geocoding: the Google OAuth client
 * that members consent to, the key that seals their tokens, and — optional —
 * the Pub/Sub topic Gmail pushes changes to. Without the topic the worker
 * still works, polling `history.list` from the cron instead of being pushed
 * to; without the client or the key nothing works and every surface says so
 * (the settings page's alert, the endpoints' 503) rather than crashing.
 *
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET   the web OAuth client
 *   MAILBOX_TOKEN_KEY        32 bytes, base64 — `openssl rand -base64 32`
 *   GOOGLE_PUBSUB_TOPIC      projects/<project>/topics/<topic>, or unset to poll
 *   CRON_SECRET              what Vercel sends the cron endpoint (read there)
 */

export interface MailSyncEnv extends GoogleEnv, TokenEnv {
	GOOGLE_PUBSUB_TOPIC?: string | undefined;
}

export interface MailSyncConfig {
	oauth: GoogleOAuthConfig;
	/** The sealing key for `mailbox_credentials`. */
	key: Buffer;
	/** Gmail pushes to this topic; null means the cron polls instead. */
	pubsubTopic: string | null;
}

export function mailSyncConfig(source: MailSyncEnv = env): MailSyncConfig | null {
	const oauth = googleOAuthConfig(source);
	const key = tokenKey(source);
	if (!oauth || !key) return null;
	const pubsubTopic = (source.GOOGLE_PUBSUB_TOPIC ?? '').trim();
	return { oauth, key, pubsubTopic: pubsubTopic || null };
}

export function isMailSyncConfigured(source: MailSyncEnv = env): boolean {
	return mailSyncConfig(source) !== null;
}

/** What a screen says when the deployment has no Google client. */
export const MAIL_SYNC_UNCONFIGURED =
	'Email sync is not configured on this server. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and MAILBOX_TOKEN_KEY.';
