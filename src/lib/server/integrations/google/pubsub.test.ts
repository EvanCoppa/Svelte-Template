import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	parsePushBody,
	pushConfig,
	verifyPushToken,
	type PushConfig,
	type PushEnv,
	type SigningJwk
} from './pubsub';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: strangerKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const jwk: SigningJwk = { ...publicKey.export({ format: 'jwk' }), kid: KID };

const NOW = new Date('2026-09-14T12:00:00Z');
const config: PushConfig = {
	serviceAccount: 'gmail-push@project.iam.gserviceaccount.com',
	audience: 'https://app.test/api/integrations/google/push'
};

interface Header {
	alg: string;
	kid?: string;
	typ?: string;
}

interface Claims {
	iss?: string;
	aud?: string | string[];
	exp?: number;
	iat?: number;
	email?: string;
	email_verified?: boolean;
}

function claims(extra: Partial<Claims> = {}): Claims {
	return {
		iss: 'https://accounts.google.com',
		aud: config.audience,
		exp: NOW.getTime() / 1000 + 600,
		iat: NOW.getTime() / 1000 - 60,
		email: config.serviceAccount,
		email_verified: true,
		...extra
	};
}

const segment = (value: Header | Claims) =>
	Buffer.from(JSON.stringify(value)).toString('base64url');

function signJwt(header: Header, payload: Claims, key: KeyObject = privateKey): string {
	const signingInput = `${segment(header)}.${segment(payload)}`;
	const signature = sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
	return `${signingInput}.${signature}`;
}

function bearer(
	payload: Claims = claims(),
	header: Header = { alg: 'RS256', kid: KID, typ: 'JWT' }
) {
	return `Bearer ${signJwt(header, payload)}`;
}

const deps = { jwks: [jwk], now: () => NOW };

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('pushConfig', () => {
	it('is disabled by default and reads both values trimmed', () => {
		expect(pushConfig({})).toBeNull();
		const source: PushEnv = {
			GOOGLE_PUSH_SERVICE_ACCOUNT: ` ${config.serviceAccount} `,
			GOOGLE_PUSH_AUDIENCE: config.audience
		};
		expect(pushConfig(source)).toEqual(config);
	});

	it('refuses (loudly) half a configuration', () => {
		expect(pushConfig({ GOOGLE_PUSH_AUDIENCE: config.audience })).toBeNull();
		expect(pushConfig({ GOOGLE_PUSH_SERVICE_ACCOUNT: config.serviceAccount })).toBeNull();
		expect(console.error).toHaveBeenCalledTimes(2);
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_PUSH_AUDIENCE'));
	});
});

describe('verifyPushToken', () => {
	it('accepts a token Google would sign for the subscription', async () => {
		await expect(verifyPushToken(bearer(), config, deps)).resolves.toEqual({
			ok: true,
			email: config.serviceAccount
		});
		await expect(
			verifyPushToken(bearer(claims({ iss: 'accounts.google.com' })), config, deps)
		).resolves.toEqual({ ok: true, email: config.serviceAccount });
	});

	it('refuses a missing or malformed header', async () => {
		await expect(verifyPushToken(null, config, deps)).resolves.toEqual({
			ok: false,
			error: 'No bearer token.'
		});
		await expect(verifyPushToken(undefined, config, deps)).resolves.toMatchObject({ ok: false });
		await expect(verifyPushToken('', config, deps)).resolves.toMatchObject({ ok: false });
		await expect(verifyPushToken('Basic abc', config, deps)).resolves.toMatchObject({ ok: false });
		await expect(verifyPushToken('Bearer a.b', config, deps)).resolves.toEqual({
			ok: false,
			error: 'Malformed token.'
		});
		await expect(verifyPushToken('Bearer a.b.c', config, deps)).resolves.toEqual({
			ok: false,
			error: 'Unreadable token header.'
		});
	});

	it('refuses anything but RS256, and a token naming no key or an unknown one', async () => {
		await expect(
			verifyPushToken(bearer(claims(), { alg: 'HS256', kid: KID }), config, deps)
		).resolves.toEqual({ ok: false, error: 'Unsupported algorithm HS256.' });
		await expect(
			verifyPushToken(bearer(claims(), { alg: 'none', kid: KID }), config, deps)
		).resolves.toEqual({ ok: false, error: 'Unsupported algorithm none.' });
		await expect(
			verifyPushToken(bearer(claims(), { alg: 'RS256' }), config, deps)
		).resolves.toEqual({
			ok: false,
			error: 'Token names no signing key.'
		});
		await expect(
			verifyPushToken(bearer(claims(), { alg: 'RS256', kid: 'someone-else' }), config, deps)
		).resolves.toEqual({ ok: false, error: 'Unknown signing key.' });
	});

	it('refuses a bad signature before reading a single claim', async () => {
		const stranger = `Bearer ${signJwt({ alg: 'RS256', kid: KID }, claims(), strangerKey)}`;
		await expect(verifyPushToken(stranger, config, deps)).resolves.toEqual({
			ok: false,
			error: 'Bad signature.'
		});
		const [header, , signature] = signJwt({ alg: 'RS256', kid: KID }, claims()).split('.');
		const swapped = `Bearer ${header}.${segment(claims({ email: 'evil@example.com' }))}.${signature}`;
		await expect(verifyPushToken(swapped, config, deps)).resolves.toEqual({
			ok: false,
			error: 'Bad signature.'
		});
	});

	it('checks the issuer, the audience, the expiry and the service account', async () => {
		const refusal = async (payload: Claims) => verifyPushToken(bearer(payload), config, deps);
		await expect(refusal(claims({ iss: 'https://evil.example' }))).resolves.toEqual({
			ok: false,
			error: 'Unexpected issuer.'
		});
		await expect(refusal(claims({ aud: 'https://other.test/push' }))).resolves.toEqual({
			ok: false,
			error: 'Unexpected audience.'
		});
		await expect(refusal(claims({ aud: [config.audience, 'x'] }))).resolves.toMatchObject({
			ok: true
		});
		await expect(refusal(claims({ exp: NOW.getTime() / 1000 - 1 }))).resolves.toEqual({
			ok: false,
			error: 'Token expired.'
		});
		await expect(refusal(claims({ exp: undefined }))).resolves.toEqual({
			ok: false,
			error: 'Token expired.'
		});
		await expect(
			refusal(claims({ email: 'other@project.iam.gserviceaccount.com' }))
		).resolves.toEqual({
			ok: false,
			error: 'Unexpected service account.'
		});
		await expect(refusal(claims({ email_verified: false }))).resolves.toEqual({
			ok: false,
			error: 'Service account email not verified.'
		});
	});

	it("fetches Google's certificates when no keys are injected, and keeps them for an hour", async () => {
		const fetchSpy = vi.fn<typeof fetch>(async () =>
			Response.json({ keys: [{ ...jwk, alg: 'RS256', use: 'sig' }] })
		);
		const at = (minutes: number) => () => new Date(NOW.getTime() + minutes * 60 * 1000);
		const token = bearer(claims({ exp: NOW.getTime() / 1000 + 3 * 60 * 60 }));

		await expect(
			verifyPushToken(token, config, { fetchImpl: fetchSpy, now: at(0) })
		).resolves.toMatchObject({ ok: true });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://www.googleapis.com/oauth2/v3/certs');

		await expect(
			verifyPushToken(token, config, { fetchImpl: fetchSpy, now: at(30) })
		).resolves.toMatchObject({ ok: true });
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		await expect(
			verifyPushToken(token, config, { fetchImpl: fetchSpy, now: at(61) })
		).resolves.toMatchObject({ ok: true });
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		const unknown = bearer(claims(), { alg: 'RS256', kid: 'rotated' });
		await expect(
			verifyPushToken(unknown, config, { fetchImpl: fetchSpy, now: at(61) })
		).resolves.toEqual({ ok: false, error: 'Unknown signing key.' });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		await expect(
			verifyPushToken(unknown, config, { fetchImpl: fetchSpy, now: at(63) })
		).resolves.toEqual({ ok: false, error: 'Unknown signing key.' });
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});

	it('refuses, without throwing, when the certificates cannot be fetched', async () => {
		const down = vi.fn<typeof fetch>(async () => {
			throw new Error('ECONNRESET');
		});
		const far = () => new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
		await expect(verifyPushToken(bearer(), config, { fetchImpl: down, now: far })).resolves.toEqual(
			{ ok: false, error: 'Unknown signing key.' }
		);
	});
});

describe('parsePushBody', () => {
	const notification = (data: string) => ({
		message: { data, messageId: '2070443601311540', publishTime: '2021-02-26T19:13:55.749Z' },
		subscription: 'projects/project/subscriptions/gmail-push'
	});

	it('reads the mailbox and history id, however the data was encoded', () => {
		const json = '{"emailAddress":"ada@example.com","historyId":9876543210}';
		expect(parsePushBody(notification(Buffer.from(json).toString('base64')))).toEqual({
			emailAddress: 'ada@example.com',
			historyId: '9876543210'
		});
		expect(parsePushBody(notification(Buffer.from(json).toString('base64url')))).toEqual({
			emailAddress: 'ada@example.com',
			historyId: '9876543210'
		});
		expect(
			parsePushBody(
				notification(
					Buffer.from('{"emailAddress":"ada@example.com","historyId":"42"}').toString('base64')
				)
			)
		).toEqual({ emailAddress: 'ada@example.com', historyId: '42' });
	});

	it('answers null for anything else', () => {
		expect(parsePushBody(null)).toBeNull();
		expect(parsePushBody('{}')).toBeNull();
		expect(parsePushBody({})).toBeNull();
		expect(parsePushBody({ message: {} })).toBeNull();
		expect(parsePushBody(notification('not base64 json'))).toBeNull();
		expect(
			parsePushBody(notification(Buffer.from('{"historyId":1}').toString('base64')))
		).toBeNull();
		expect(parsePushBody(notification(Buffer.from('[]').toString('base64')))).toBeNull();
	});
});
