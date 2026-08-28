import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { actions } from './+page.server';

function harness({
	signInError = null,
	resetError = null
}: {
	signInError?: { message: string } | null;
	resetError?: { message: string } | null;
} = {}) {
	const auth = {
		signInWithPassword: vi.fn().mockResolvedValue({ error: signInError }),
		resetPasswordForEmail: vi.fn().mockResolvedValue({ error: resetError })
	};

	return {
		auth,
		event: (fields: Record<string, string>) => ({
			url: new URL('https://app.test/login'),
			locals: { supabase: { auth } },
			request: {
				formData: () => Promise.resolve(new Map(Object.entries(fields)))
			}
		})
	};
}

function run(name: 'login' | 'reset', event: unknown) {
	const action = actions[name];
	if (!action) throw new Error(`login page has no ${name} action`);
	return action(event as never);
}

async function redirectOf(runIt: () => unknown) {
	try {
		await runIt();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('expected a redirect');
}

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('login action', () => {
	it('signs in and follows an internal `next` path', async () => {
		const h = harness();

		const redirect = await redirectOf(() =>
			run('login', h.event({ email: 'User@Example.com ', password: 'pw', next: '/settings' }))
		);

		expect(h.auth.signInWithPassword).toHaveBeenCalledWith({
			email: 'user@example.com',
			password: 'pw'
		});
		expect(redirect.location).toBe('/settings');
		expect(redirect.status).toBe(303);
	});

	it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)'])(
		'refuses the open redirect %s and lands on the dashboard instead',
		async (evil) => {
			const h = harness();

			const redirect = await redirectOf(() =>
				run('login', h.event({ email: 'user@example.com', password: 'pw', next: evil }))
			);

			expect(redirect.location).toBe('/');
		}
	);

	it('returns one generic message for any failed sign-in (no user enumeration)', async () => {
		const h = harness({ signInError: { message: 'User not found' } });

		const result = await run(
			'login',
			h.event({ email: 'nobody@example.com', password: 'pw', next: '/' })
		);

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Invalid email or password.' }
		});
	});
});

describe('reset action', () => {
	it('requests the email with a recovery redirect on this origin', async () => {
		const h = harness();

		const result = await run('reset', h.event({ email: 'user@example.com' }));

		expect(h.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
			redirectTo: 'https://app.test/auth/confirm?type=recovery'
		});
		expect(result).toMatchObject({ resetOk: true });
	});

	it('reports the same success even when Supabase refuses (no user enumeration)', async () => {
		const h = harness({ resetError: { message: 'rate limited' } });

		const result = await run('reset', h.event({ email: 'user@example.com' }));

		expect(result).toMatchObject({ resetOk: true });
	});
});
