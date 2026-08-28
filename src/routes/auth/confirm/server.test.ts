import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { PASSWORD_RECOVERY_COOKIE } from '$lib/server/password-recovery';
import { GET } from './+server';

interface AuthStub {
	verifyOtp: ReturnType<typeof vi.fn>;
	exchangeCodeForSession: ReturnType<typeof vi.fn>;
}

function authStub(overrides: Partial<Record<keyof AuthStub, unknown>> = {}): AuthStub {
	return {
		verifyOtp: vi.fn().mockResolvedValue({ error: null }),
		exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
		...overrides
	} as AuthStub;
}

function callGet(search: string, auth: AuthStub) {
	const jar: Record<string, string> = {};
	const cookies = {
		get: (name: string) => jar[name],
		set: vi.fn((name: string, value: string) => {
			jar[name] = value;
		}),
		delete: vi.fn()
	};

	const event = {
		url: new URL(`https://app.test/auth/confirm${search}`),
		cookies,
		locals: { supabase: { auth } }
	};

	return { cookies, jar, run: () => GET(event as never) };
}

/** The handler always finishes by throwing a redirect; unwrap it. */
async function redirectOf(run: () => unknown) {
	try {
		await run();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('expected the handler to redirect');
}

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('GET /auth/confirm', () => {
	it('exchanges a PKCE code and sends the user to the reset form', async () => {
		const auth = authStub();
		const { jar, run } = callGet('?code=pkce-code&type=recovery', auth);

		const redirect = await redirectOf(run);

		expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
		expect(auth.verifyOtp).not.toHaveBeenCalled();
		expect(jar[PASSWORD_RECOVERY_COOKIE]).toBe('1');
		expect(redirect.location).toBe('/reset-password');
		expect(redirect.status).toBe(303);
	});

	it('verifies a token_hash link, which works from a different device', async () => {
		const auth = authStub();
		const { jar, run } = callGet('?token_hash=abc123&type=recovery', auth);

		const redirect = await redirectOf(run);

		expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
		expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
		expect(jar[PASSWORD_RECOVERY_COOKIE]).toBe('1');
		expect(redirect.location).toBe('/reset-password');
	});

	it('treats an unlabelled link as a recovery, since nothing else points here', async () => {
		const auth = authStub();
		const { jar, run } = callGet('?token_hash=abc123', auth);

		const redirect = await redirectOf(run);

		expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
		expect(jar[PASSWORD_RECOVERY_COOKIE]).toBe('1');
		expect(redirect.location).toBe('/reset-password');
	});

	it('bounces a rejected token back to sign-in without marking a recovery', async () => {
		const auth = authStub({
			verifyOtp: vi.fn().mockResolvedValue({ error: { message: 'Token has expired' } })
		});
		const { cookies, run } = callGet('?token_hash=stale&type=recovery', auth);

		const redirect = await redirectOf(run);

		expect(redirect.location).toBe('/login?error=link_invalid');
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('bounces a link carrying no token at all', async () => {
		const auth = authStub();
		const { cookies, run } = callGet('?type=recovery', auth);

		const redirect = await redirectOf(run);

		expect(redirect.location).toBe('/login?error=link_invalid');
		expect(auth.verifyOtp).not.toHaveBeenCalled();
		expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('sends a non-recovery link to its `next` destination without the recovery pin', async () => {
		const auth = authStub();
		const { cookies, run } = callGet('?token_hash=abc123&type=email&next=/settings', auth);

		const redirect = await redirectOf(run);

		expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'email' });
		expect(redirect.location).toBe('/settings');
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('refuses an external `next` — only internal paths may pass', async () => {
		const auth = authStub();

		for (const evil of ['https://evil.example', '//evil.example']) {
			const { run } = callGet(
				`?token_hash=abc123&type=email&next=${encodeURIComponent(evil)}`,
				auth
			);
			const redirect = await redirectOf(run);
			expect(redirect.location).toBe('/');
		}
	});
});
