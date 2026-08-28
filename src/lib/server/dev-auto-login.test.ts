import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	devAutoLogin,
	devAutoLoginConfig,
	isDevAutoLoginEnabled,
	shouldAttemptDevAutoLogin,
	type AutoLoginAdminClient,
	type AutoLoginClient,
	type DevAutoLoginEnv
} from './dev-auto-login';

/** Minimal env where auto-login is enabled and safe. */
function enabledEnv(extra: DevAutoLoginEnv = {}): DevAutoLoginEnv {
	return {
		DEV_AUTO_LOGIN: 'true',
		DEV_AUTO_LOGIN_EMAIL: 'dev@example.com',
		SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
		...extra
	};
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

	const client: AutoLoginAdminClient = { auth: { admin: { generateLink, createUser } } };
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
	const client: AutoLoginClient = { auth: { verifyOtp } };
	return { client, verifyOtp };
}

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('devAutoLoginConfig', () => {
	it('is disabled by default', () => {
		expect(devAutoLoginConfig({})).toBeNull();
		expect(isDevAutoLoginEnabled({})).toBe(false);
	});

	it('is enabled with the flag, an email, and the service key', () => {
		expect(devAutoLoginConfig(enabledEnv())).toEqual({ email: 'dev@example.com' });
		expect(isDevAutoLoginEnabled(enabledEnv())).toBe(true);
	});

	it('normalizes the configured email', () => {
		const env = enabledEnv({ DEV_AUTO_LOGIN_EMAIL: '  Dev@Example.COM ' });
		expect(devAutoLoginConfig(env)).toEqual({ email: 'dev@example.com' });
	});

	it('REFUSES to run on a Vercel production deployment', () => {
		expect(devAutoLoginConfig(enabledEnv({ VERCEL_ENV: 'production' }))).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REFUSING'));
	});

	it('refuses without the service-role key', () => {
		expect(devAutoLoginConfig(enabledEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }))).toBeNull();
	});

	it('refuses without a configured email', () => {
		expect(devAutoLoginConfig(enabledEnv({ DEV_AUTO_LOGIN_EMAIL: undefined }))).toBeNull();
	});

	it('treats non-truthy flag values as off', () => {
		for (const value of ['0', 'false', 'off', 'nope', '']) {
			expect(devAutoLoginConfig(enabledEnv({ DEV_AUTO_LOGIN: value }))).toBeNull();
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
		const admin = adminStub();
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, {
			createAdminClient: () => admin.client,
			envSource: enabledEnv()
		});

		expect(admin.generateLink).toHaveBeenCalledWith({
			type: 'magiclink',
			email: 'dev@example.com'
		});
		expect(admin.createUser).not.toHaveBeenCalled();
		expect(ssr.verifyOtp).toHaveBeenCalledWith({ token_hash: 'token-hash', type: 'magiclink' });
		expect(result?.user).toMatchObject({ id: 'user-1' });
	});

	it('creates a missing user, then retries the link once', async () => {
		const admin = adminStub({
			link: { data: { properties: null, user: null }, error: { message: 'User not found' } }
		});
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, {
			createAdminClient: () => admin.client,
			envSource: enabledEnv()
		});

		expect(admin.createUser).toHaveBeenCalledWith({
			email: 'dev@example.com',
			email_confirm: true
		});
		expect(admin.generateLink).toHaveBeenCalledTimes(2);
		expect(result).not.toBeNull();
	});

	it('leaves the request unauthenticated when redemption fails', async () => {
		const admin = adminStub();
		const ssr = ssrStub({ data: { session: null, user: null }, error: { message: 'bad token' } });

		const result = await devAutoLogin(ssr.client, {
			createAdminClient: () => admin.client,
			envSource: enabledEnv()
		});

		expect(result).toBeNull();
	});

	it('does nothing at all when the feature is off', async () => {
		const ssr = ssrStub();

		const result = await devAutoLogin(ssr.client, {
			createAdminClient: () => adminStub().client,
			envSource: {}
		});

		expect(result).toBeNull();
		expect(ssr.verifyOtp).not.toHaveBeenCalled();
	});
});
