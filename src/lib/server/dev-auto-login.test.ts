import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { mockEnv } = vi.hoisted(() => {
	const mockEnv: Record<string, string | undefined> = {};
	return { mockEnv };
});

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/supabase.server', () => ({
	createSupabaseAdminClient: () => {
		throw new Error('service role key missing');
	}
}));

import {
	devAutoLogin,
	devAutoLoginConfig,
	isDevAutoLoginEnabled,
	shouldAttemptDevAutoLogin
} from './dev-auto-login';

function setEnv(values: Record<string, string | undefined>) {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	Object.assign(mockEnv, values);
}

/** Minimal env where auto-login is enabled and safe. */
function enabledEnv(extra: Record<string, string | undefined> = {}) {
	setEnv({
		DEV_AUTO_LOGIN: 'true',
		DEV_AUTO_LOGIN_EMAIL: 'dev@example.com',
		SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
		...extra
	});
}

/** Stubs the handful of service-role calls `devAutoLogin` makes. */
function adminStub(
	options: {
		link?: unknown;
		linkOnRetry?: unknown;
		createUserError?: { message: string } | null;
	} = {}
) {
	const okLink = {
		data: { properties: { hashed_token: 'token-hash' }, user: { id: 'user-1' } },
		error: null
	};

	// First call may fail (user missing); every later call is the post-createUser retry.
	const generateLink = vi.fn();
	generateLink.mockResolvedValueOnce(options.link ?? okLink);
	generateLink.mockResolvedValue(options.linkOnRetry ?? okLink);

	const createUser = vi.fn().mockResolvedValue({
		data: { user: { id: 'user-1' } },
		error: options.createUserError ?? null
	});

	const client = { auth: { admin: { generateLink, createUser } } } as unknown as SupabaseClient;
	return { client, generateLink, createUser };
}

/** Stubs the request-scoped `@supabase/ssr` client that redeems the token. */
function ssrStub(result?: { data?: unknown; error?: { message: string } }) {
	const verifyOtp = vi.fn().mockResolvedValue(
		result ?? {
			data: { session: { access_token: 'at' }, user: { id: 'user-1' } },
			error: null
		}
	);
	return {
		client: { auth: { verifyOtp } } as unknown as SupabaseClient,
		verifyOtp
	};
}

beforeEach(() => {
	setEnv({});
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('devAutoLoginConfig', () => {
	it('is disabled by default', () => {
		expect(devAutoLoginConfig()).toBeNull();
		expect(isDevAutoLoginEnabled()).toBe(false);
	});

	it('is enabled with the flag, an email, and the service key', () => {
		enabledEnv();
		expect(devAutoLoginConfig()).toEqual({ email: 'dev@example.com' });
		expect(isDevAutoLoginEnabled()).toBe(true);
	});

	it('normalizes the configured email', () => {
		enabledEnv({ DEV_AUTO_LOGIN_EMAIL: '  Dev@Example.COM ' });
		expect(devAutoLoginConfig()).toEqual({ email: 'dev@example.com' });
	});

	it('REFUSES to run on a Vercel production deployment', () => {
		enabledEnv({ VERCEL_ENV: 'production' });
		expect(devAutoLoginConfig()).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REFUSING'));
	});

	it('refuses without the service-role key', () => {
		enabledEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });
		expect(devAutoLoginConfig()).toBeNull();
	});

	it('refuses without a configured email', () => {
		enabledEnv({ DEV_AUTO_LOGIN_EMAIL: undefined });
		expect(devAutoLoginConfig()).toBeNull();
	});

	it('treats non-truthy flag values as off', () => {
		for (const value of ['0', 'false', 'off', 'nope', '']) {
			enabledEnv({ DEV_AUTO_LOGIN: value });
			expect(devAutoLoginConfig()).toBeNull();
		}
	});
});

describe('shouldAttemptDevAutoLogin', () => {
	it('runs on ordinary pages, including /login', () => {
		expect(shouldAttemptDevAutoLogin({ pathname: '/', optedOut: false })).toBe(true);
		expect(shouldAttemptDevAutoLogin({ pathname: '/login', optedOut: false })).toBe(true);
		expect(shouldAttemptDevAutoLogin({ pathname: '/settings', optedOut: false })).toBe(true);
	});

	it('never runs when the browser opted out by signing out', () => {
		expect(shouldAttemptDevAutoLogin({ pathname: '/', optedOut: true })).toBe(false);
	});

	it('leaves /logout and the emailed-link flows unauthenticated', () => {
		expect(shouldAttemptDevAutoLogin({ pathname: '/logout', optedOut: false })).toBe(false);
		expect(shouldAttemptDevAutoLogin({ pathname: '/auth/confirm', optedOut: false })).toBe(false);
	});
});

describe('devAutoLogin', () => {
	it('mints a magic link and redeems it on the request client', async () => {
		enabledEnv();
		const admin = adminStub();
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, { createAdminClient: () => admin.client });

		expect(admin.generateLink).toHaveBeenCalledWith({
			type: 'magiclink',
			email: 'dev@example.com'
		});
		expect(admin.createUser).not.toHaveBeenCalled();
		expect(ssr.verifyOtp).toHaveBeenCalledWith({ token_hash: 'token-hash', type: 'magiclink' });
		expect(result?.user).toMatchObject({ id: 'user-1' });
	});

	it('creates a missing user, then retries the link once', async () => {
		enabledEnv();
		const admin = adminStub({
			link: { data: { properties: null, user: null }, error: { message: 'User not found' } }
		});
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, { createAdminClient: () => admin.client });

		expect(admin.createUser).toHaveBeenCalledWith({
			email: 'dev@example.com',
			email_confirm: true
		});
		expect(admin.generateLink).toHaveBeenCalledTimes(2);
		expect(result).not.toBeNull();
	});

	it('leaves the request unauthenticated when redemption fails', async () => {
		enabledEnv();
		const admin = adminStub();
		const ssr = ssrStub({ data: { session: null, user: null }, error: { message: 'bad token' } });

		const result = await devAutoLogin(ssr.client, { createAdminClient: () => admin.client });

		expect(result).toBeNull();
	});

	it('does nothing at all when the feature is off', async () => {
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, {
			createAdminClient: () => adminStub().client
		});

		expect(result).toBeNull();
		expect(ssr.verifyOtp).not.toHaveBeenCalled();
	});
});
