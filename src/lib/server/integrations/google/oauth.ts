/**
 * Google OAuth — the consent handshake behind a Gmail connection.
 *
 * This is the provider half of the Gmail integration and knows nothing about
 * organizations, members or rows. A connect flow calls `pkcePair()` and
 * `authorizationUrl()` to send the browser to Google's consent screen,
 * `exchangeCode()` when Google sends it back with a code,
 * `refreshAccessToken()` once the hour-long access token has run out, and
 * `revokeToken()` when the member disconnects. What the grant is — the
 * refresh token, when the access token expires, which scopes were actually
 * granted — is the caller's to store, and `hasScopes()` reads that granted
 * list back before a feature relies on it.
 *
 * Configuration is entirely env-driven, like email (`src/lib/server/email.ts`)
 * and geocoding:
 *
 *   GOOGLE_OAUTH_CLIENT_ID       the OAuth web client's id (Google Cloud console)
 *   GOOGLE_OAUTH_CLIENT_SECRET   that client's secret
 *
 * Nothing here throws on a bad answer: every token call resolves to a
 * `TokenResult` and `revokeToken()` to a boolean, so a flow decides at the
 * call site what a failure means. The protocol is Google's web-server flow:
 * https://developers.google.com/identity/protocols/oauth2/web-server
 */
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '$env/dynamic/private';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/**
 * The env vars the Google OAuth client reads, injectable so tests can vary
 * them. The index signature is what lets the real `$env/dynamic/private` env
 * satisfy this — see `EmailEnv` for why.
 */
export interface GoogleEnv {
	GOOGLE_OAUTH_CLIENT_ID?: string | undefined;
	GOOGLE_OAUTH_CLIENT_SECRET?: string | undefined;
	[key: string]: string | undefined;
}

export interface GoogleOAuthConfig {
	clientId: string;
	clientSecret: string;
}

/**
 * Resolve the OAuth client, or `null` when Google sign-in is off. Half a
 * client — an id without its secret, or the reverse — is refused loudly
 * rather than silently.
 */
export function googleOAuthConfig(source: GoogleEnv = env): GoogleOAuthConfig | null {
	const clientId = (source.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
	const clientSecret = (source.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim();
	if (!clientId && !clientSecret) return null;
	if (!clientId || !clientSecret) {
		console.error(
			'[google] GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must both be set — ' +
				'Google sign-in disabled.'
		);
		return null;
	}
	return { clientId, clientSecret };
}

/** What a Gmail connection asks for: read the mailbox, send from it. Nothing broader. */
export const GMAIL_SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/gmail.send'
] as const;

/**
 * A fresh PKCE pair for one authorization attempt: the verifier is kept
 * server-side (in the connect flow's cookie or row) and the S256 challenge
 * goes into the authorization URL, so a code intercepted on the way back is
 * useless without the verifier. 32 random bytes make a 43-character
 * base64url verifier, inside RFC 7636's 43–128 range.
 */
export function pkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

export interface AuthorizationParams {
	/** Must match a redirect URI registered on the OAuth client, exactly. */
	redirectUri: string;
	/** CSRF token; Google echoes it back unchanged. */
	state: string;
	/** `pkcePair().challenge`. */
	codeChallenge: string;
	/** Pre-selects the Google account when the member's email is known. */
	loginHint?: string | null;
	/** Defaults to `GMAIL_SCOPES`. */
	scopes?: readonly string[];
}

/**
 * The URL the browser is sent to for consent. `access_type=offline` with
 * `prompt=consent` is what makes Google issue a refresh token every time —
 * without the prompt a returning user gets an access token only, and the sync
 * would die an hour later.
 */
export function authorizationUrl(config: GoogleOAuthConfig, params: AuthorizationParams): string {
	const url = new URL(AUTHORIZATION_ENDPOINT);
	url.searchParams.set('client_id', config.clientId);
	url.searchParams.set('redirect_uri', params.redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', (params.scopes ?? GMAIL_SCOPES).join(' '));
	url.searchParams.set('state', params.state);
	url.searchParams.set('code_challenge', params.codeChallenge);
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');
	url.searchParams.set('include_granted_scopes', 'true');
	if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
	return url.toString();
}

export type TokenResult =
	| {
			ok: true;
			accessToken: string;
			/** Google issues one on the first consent; a refresh answers `null` — keep the one you have. */
			refreshToken: string | null;
			/** ISO instant the access token stops working, computed from `expires_in` and `now`. */
			expiresAt: string;
			/** The scopes actually granted, space-separated as Google returns them. */
			scope: string;
	  }
	| { ok: false; code: 'invalid_grant' | 'other'; error: string };

export interface GoogleTokenDeps {
	/** Override the fetch used (tests). */
	fetchImpl?: typeof fetch;
	/** Override the clock the expiry is computed from (tests). */
	now?: () => Date;
}

/** What the token endpoint answers on success. */
const tokenResponse = z.object({
	access_token: z.string().min(1),
	expires_in: z.number(),
	refresh_token: z.string().optional(),
	scope: z.string().default('')
});

/** What it answers on failure: `invalid_grant` is the one the caller must tell apart. */
const tokenError = z.object({ error: z.string(), error_description: z.string().optional() });

async function requestToken(form: URLSearchParams, deps: GoogleTokenDeps): Promise<TokenResult> {
	const now = deps.now ?? (() => new Date());
	try {
		const response = await (deps.fetchImpl ?? fetch)(TOKEN_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
			body: form.toString()
		});
		if (!response.ok) {
			const parsed = tokenError.safeParse(await response.json().catch(() => null));
			if (!parsed.success) {
				return { ok: false, code: 'other', error: `Google answered ${response.status}.` };
			}
			return {
				ok: false,
				code: parsed.data.error === 'invalid_grant' ? 'invalid_grant' : 'other',
				error: parsed.data.error_description ?? parsed.data.error
			};
		}
		const parsed = tokenResponse.safeParse(await response.json().catch(() => null));
		if (!parsed.success) {
			return { ok: false, code: 'other', error: 'Google answered something unexpected.' };
		}
		return {
			ok: true,
			accessToken: parsed.data.access_token,
			refreshToken: parsed.data.refresh_token ?? null,
			expiresAt: new Date(now().getTime() + parsed.data.expires_in * 1000).toISOString(),
			scope: parsed.data.scope
		};
	} catch (cause) {
		return {
			ok: false,
			code: 'other',
			error: cause instanceof Error ? cause.message : 'Google unreachable.'
		};
	}
}

export interface CodeExchange {
	/** The `code` Google appended to the redirect. */
	code: string;
	/** The same redirect URI the authorization URL carried. */
	redirectUri: string;
	/** `pkcePair().verifier`, kept from the start of this attempt. */
	codeVerifier: string;
}

/**
 * Turn the code Google sent back into tokens. `invalid_grant` means the code
 * is spent, expired or was minted for another client — the flow starts over;
 * anything else is Google or the network and is worth retrying.
 */
export async function exchangeCode(
	config: GoogleOAuthConfig,
	params: CodeExchange,
	deps: GoogleTokenDeps = {}
): Promise<TokenResult> {
	return requestToken(
		new URLSearchParams({
			grant_type: 'authorization_code',
			code: params.code,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: params.redirectUri,
			code_verifier: params.codeVerifier
		}),
		deps
	);
}

/**
 * A new access token from a stored refresh token. `invalid_grant` here means
 * the member revoked access (or the token has been unused for too long) and
 * the connection needs re-consenting — the caller marks it disconnected
 * rather than retrying.
 */
export async function refreshAccessToken(
	config: GoogleOAuthConfig,
	refreshToken: string,
	deps: GoogleTokenDeps = {}
): Promise<TokenResult> {
	return requestToken(
		new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: config.clientId,
			client_secret: config.clientSecret
		}),
		deps
	);
}

/**
 * Tell Google the grant is over. Either token works and revoking one revokes
 * the other. `true` on a 2xx; a `false` is worth logging but never worth
 * failing a disconnect over — the row is deleted either way.
 */
export async function revokeToken(
	token: string,
	deps: Pick<GoogleTokenDeps, 'fetchImpl'> = {}
): Promise<boolean> {
	try {
		const response = await (deps.fetchImpl ?? fetch)(
			`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`,
			{ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }
		);
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Whether a grant covers every scope a feature needs. `granted` is the
 * space-separated scope string Google returns with the tokens — a member can
 * untick a checkbox on the consent screen, so what was asked for is not what
 * was given.
 */
export function hasScopes(granted: string, required: readonly string[]): boolean {
	const held = new Set(granted.split(/\s+/).filter((scope) => scope !== ''));
	return required.every((scope) => held.has(scope));
}
