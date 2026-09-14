import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	authorizationUrl,
	exchangeCode,
	GMAIL_SCOPES,
	googleOAuthConfig,
	hasScopes,
	pkcePair,
	refreshAccessToken,
	revokeToken,
	type GoogleEnv,
	type GoogleOAuthConfig
} from './oauth';

const configured: GoogleEnv = {
	GOOGLE_OAUTH_CLIENT_ID: ' client-1.apps.googleusercontent.com ',
	GOOGLE_OAUTH_CLIENT_SECRET: 'secret-1'
};

const config: GoogleOAuthConfig = {
	clientId: 'client-1.apps.googleusercontent.com',
	clientSecret: 'secret-1'
};

const NOW = new Date('2026-09-14T12:00:00Z');

function fetchAnswering(status: number, body: string) {
	return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

/** The form a token request posted, decoded. */
function postedForm(fetchSpy: ReturnType<typeof fetchAnswering>): URLSearchParams {
	const [, init] = fetchSpy.mock.calls[0] ?? [];
	return new URLSearchParams(String(init?.body));
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('googleOAuthConfig', () => {
	it('is disabled by default', () => {
		expect(googleOAuthConfig({})).toBeNull();
		expect(console.error).not.toHaveBeenCalled();
	});

	it('reads and trims both halves of the client', () => {
		expect(googleOAuthConfig(configured)).toEqual(config);
	});

	it('refuses (loudly) half a client', () => {
		expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_ID: 'client-1' })).toBeNull();
		expect(googleOAuthConfig({ GOOGLE_OAUTH_CLIENT_SECRET: 'secret-1' })).toBeNull();
		expect(console.error).toHaveBeenCalledTimes(2);
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining('GOOGLE_OAUTH_CLIENT_SECRET')
		);
	});
});

describe('pkcePair', () => {
	it('makes a base64url verifier in the RFC 7636 range and its S256 challenge', () => {
		const { verifier, challenge } = pkcePair();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
		expect(pkcePair().verifier).not.toBe(verifier);
	});
});

describe('authorizationUrl', () => {
	it('asks for an offline, consented, incremental code grant with PKCE', () => {
		const url = new URL(
			authorizationUrl(config, {
				redirectUri: 'https://app.test/auth/google/callback',
				state: 'state-1',
				codeChallenge: 'challenge-1',
				loginHint: 'ada@example.com'
			})
		);
		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: config.clientId,
			redirect_uri: 'https://app.test/auth/google/callback',
			response_type: 'code',
			scope: GMAIL_SCOPES.join(' '),
			state: 'state-1',
			code_challenge: 'challenge-1',
			code_challenge_method: 'S256',
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'true',
			login_hint: 'ada@example.com'
		});
	});

	it('leaves the hint out when there is none and takes other scopes', () => {
		const url = new URL(
			authorizationUrl(config, {
				redirectUri: 'https://app.test/cb',
				state: 's',
				codeChallenge: 'c',
				loginHint: null,
				scopes: ['openid', 'email']
			})
		);
		expect(url.searchParams.has('login_hint')).toBe(false);
		expect(url.searchParams.get('scope')).toBe('openid email');
	});
});

describe('exchangeCode', () => {
	const params = {
		code: 'code-1',
		redirectUri: 'https://app.test/auth/google/callback',
		codeVerifier: 'verifier-1'
	};

	it('posts the code with its verifier and reads the tokens back', async () => {
		const fetchSpy = fetchAnswering(
			200,
			JSON.stringify({
				access_token: 'access-1',
				expires_in: 3600,
				refresh_token: 'refresh-1',
				scope: GMAIL_SCOPES.join(' '),
				token_type: 'Bearer'
			})
		);

		const result = await exchangeCode(config, params, { fetchImpl: fetchSpy, now: () => NOW });

		expect(result).toEqual({
			ok: true,
			accessToken: 'access-1',
			refreshToken: 'refresh-1',
			expiresAt: '2026-09-14T13:00:00.000Z',
			scope: GMAIL_SCOPES.join(' ')
		});
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe('https://oauth2.googleapis.com/token');
		expect(init?.method).toBe('POST');
		expect(new Headers(init?.headers).get('content-type')).toBe(
			'application/x-www-form-urlencoded'
		);
		expect(Object.fromEntries(postedForm(fetchSpy))).toEqual({
			grant_type: 'authorization_code',
			code: 'code-1',
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: params.redirectUri,
			code_verifier: 'verifier-1'
		});
	});

	it('reads a grant with no refresh token and no scope as null and empty', async () => {
		const fetchSpy = fetchAnswering(200, '{"access_token":"access-1","expires_in":60}');
		await expect(
			exchangeCode(config, params, { fetchImpl: fetchSpy, now: () => NOW })
		).resolves.toMatchObject({ ok: true, refreshToken: null, scope: '' });
	});

	it('tells a spent code apart from every other refusal', async () => {
		await expect(
			exchangeCode(config, params, {
				fetchImpl: fetchAnswering(
					400,
					'{"error":"invalid_grant","error_description":"Bad Request"}'
				)
			})
		).resolves.toEqual({ ok: false, code: 'invalid_grant', error: 'Bad Request' });
		await expect(
			exchangeCode(config, params, {
				fetchImpl: fetchAnswering(401, '{"error":"invalid_client"}')
			})
		).resolves.toEqual({ ok: false, code: 'other', error: 'invalid_client' });
		await expect(
			exchangeCode(config, params, { fetchImpl: fetchAnswering(502, '<html>Bad gateway</html>') })
		).resolves.toEqual({ ok: false, code: 'other', error: 'Google answered 502.' });
	});

	it('reports an unexpected answer and a network failure without throwing', async () => {
		await expect(
			exchangeCode(config, params, { fetchImpl: fetchAnswering(200, '{"token":"?"}') })
		).resolves.toEqual({
			ok: false,
			code: 'other',
			error: 'Google answered something unexpected.'
		});
		await expect(
			exchangeCode(config, params, { fetchImpl: fetchAnswering(200, 'not json') })
		).resolves.toEqual({
			ok: false,
			code: 'other',
			error: 'Google answered something unexpected.'
		});
		const down = vi.fn<typeof fetch>(async () => {
			throw new Error('ECONNRESET');
		});
		await expect(exchangeCode(config, params, { fetchImpl: down })).resolves.toEqual({
			ok: false,
			code: 'other',
			error: 'ECONNRESET'
		});
	});
});

describe('refreshAccessToken', () => {
	it('posts the refresh grant and keeps the refresh token null', async () => {
		const fetchSpy = fetchAnswering(
			200,
			'{"access_token":"access-2","expires_in":3599,"scope":"a b","token_type":"Bearer"}'
		);

		const result = await refreshAccessToken(config, 'refresh-1', {
			fetchImpl: fetchSpy,
			now: () => NOW
		});

		expect(result).toEqual({
			ok: true,
			accessToken: 'access-2',
			refreshToken: null,
			expiresAt: '2026-09-14T12:59:59.000Z',
			scope: 'a b'
		});
		expect(Object.fromEntries(postedForm(fetchSpy))).toEqual({
			grant_type: 'refresh_token',
			refresh_token: 'refresh-1',
			client_id: config.clientId,
			client_secret: config.clientSecret
		});
	});

	it('reports a revoked grant as invalid_grant', async () => {
		await expect(
			refreshAccessToken(config, 'refresh-1', {
				fetchImpl: fetchAnswering(
					400,
					'{"error":"invalid_grant","error_description":"Token has been expired or revoked."}'
				)
			})
		).resolves.toEqual({
			ok: false,
			code: 'invalid_grant',
			error: 'Token has been expired or revoked.'
		});
	});
});

describe('revokeToken', () => {
	it('posts the token to the revoke endpoint and answers whether Google took it', async () => {
		const fetchSpy = fetchAnswering(200, '{}');
		await expect(revokeToken('refresh 1', { fetchImpl: fetchSpy })).resolves.toBe(true);
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe('https://oauth2.googleapis.com/revoke?token=refresh%201');
		expect(init?.method).toBe('POST');
		await expect(
			revokeToken('gone', { fetchImpl: fetchAnswering(400, '{"error":"invalid_token"}') })
		).resolves.toBe(false);
		const down = vi.fn<typeof fetch>(async () => {
			throw new Error('ECONNRESET');
		});
		await expect(revokeToken('gone', { fetchImpl: down })).resolves.toBe(false);
	});
});

describe('hasScopes', () => {
	it('checks the granted list, whatever its order and spacing', () => {
		const granted = `openid  ${GMAIL_SCOPES[1]}\n${GMAIL_SCOPES[0]}`;
		expect(hasScopes(granted, GMAIL_SCOPES)).toBe(true);
		expect(hasScopes(GMAIL_SCOPES[0], GMAIL_SCOPES)).toBe(false);
		expect(hasScopes('', [])).toBe(true);
		expect(hasScopes('', ['openid'])).toBe(false);
	});
});
