import { describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { PASSWORD_MIN_LENGTH } from '$lib/schemas/password';
import { PASSWORD_RECOVERY_COOKIE } from '$lib/server/password-recovery';
import { actions, load } from './+page.server';

const RECOVERING = { [PASSWORD_RECOVERY_COOKIE]: '1' };

function harness({
	cookieJar = { ...RECOVERING },
	session = { access_token: 'token' },
	user = { email: 'user@example.com' },
	updateUserError = null
}: {
	cookieJar?: Record<string, string>;
	session?: unknown;
	user?: unknown;
	updateUserError?: { message: string } | null;
} = {}) {
	const jar = { ...cookieJar };
	const cookies = {
		get: (name: string) => jar[name],
		set: vi.fn(),
		delete: vi.fn((name: string) => {
			delete jar[name];
		})
	};

	const auth = {
		updateUser: vi.fn().mockResolvedValue({ error: updateUserError }),
		signOut: vi.fn().mockResolvedValue({ error: null })
	};

	return {
		cookies,
		auth,
		jar,
		loadEvent: { cookies, locals: { session, user } },
		// superValidate demands a real Request — a duck-typed mock is treated as
		// plain data instead of being parsed as a form post.
		actionEvent: (fields: Record<string, string>) => {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.set(name, value);
			return {
				cookies,
				locals: { supabase: { auth } },
				request: new Request('https://app.test/reset-password', { method: 'POST', body })
			};
		}
	};
}

/** `actions` is an index-signature map, so pull the handler out once, typed. */
function submit(event: unknown) {
	const action = actions['default'];
	if (!action) throw new Error('reset-password has no default action');
	return action(event as never);
}

async function redirectOf(run: () => unknown) {
	try {
		await run();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('expected a redirect');
}

describe('load', () => {
	it('renders the form for a browser that just verified a recovery link', async () => {
		const h = harness();
		const data = await load(h.loadEvent as never);
		if (!data) throw new Error('expected load data');

		expect(data).toMatchObject({ email: 'user@example.com' });
		// The superform carries the schema's rules down to the inputs.
		expect(data.form.constraints?.password).toMatchObject({
			minlength: PASSWORD_MIN_LENGTH,
			required: true
		});
	});

	it('turns away a signed-in session that never went through recovery', async () => {
		const h = harness({ cookieJar: {} });

		const redirect = await redirectOf(() => load(h.loadEvent as never));
		expect(redirect.location).toBe('/login?error=recovery_link_invalid');
	});

	it('turns away a recovery marker with no session behind it', async () => {
		const h = harness({ session: null });

		const redirect = await redirectOf(() => load(h.loadEvent as never));
		expect(redirect.location).toBe('/login?error=recovery_link_invalid');
	});
});

describe('default action', () => {
	it('sets the new password, clears the marker, and forces a fresh sign-in', async () => {
		const h = harness();

		const redirect = await redirectOf(() =>
			submit(h.actionEvent({ password: 'brand-new-pw', confirm_password: 'brand-new-pw' }))
		);

		expect(h.auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pw' });
		expect(h.cookies.delete).toHaveBeenCalledWith(PASSWORD_RECOVERY_COOKIE, { path: '/' });
		expect(h.auth.signOut).toHaveBeenCalled();
		expect(redirect.location).toBe('/login?reset=success');
	});

	it('rejects a password that fails the rules without touching Supabase', async () => {
		const h = harness();

		const result = await submit(h.actionEvent({ password: 'short', confirm_password: 'short' }));

		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({ status: 400 });
		expect(h.auth.updateUser).not.toHaveBeenCalled();
	});

	it('rejects a mismatched confirmation', async () => {
		const h = harness();

		const result = await submit(
			h.actionEvent({ password: 'brand-new-pw', confirm_password: 'brand-new-pX' })
		);

		expect(isActionFailure(result)).toBe(true);
		expect(h.auth.updateUser).not.toHaveBeenCalled();
	});

	it('never echoes the passwords back in a failure response', async () => {
		const h = harness();

		const result = await submit(h.actionEvent({ password: 'short', confirm_password: 'short' }));

		expect(result).toMatchObject({
			data: { form: { data: { password: '', confirm_password: '' } } }
		});
	});

	it('keeps the user on the form and the marker intact when Supabase refuses', async () => {
		const h = harness({ updateUserError: { message: 'Password is too weak' } });

		const result = await submit(
			h.actionEvent({ password: 'brand-new-pw', confirm_password: 'brand-new-pw' })
		);

		expect(isActionFailure(result)).toBe(true);
		expect(h.cookies.delete).not.toHaveBeenCalled();
		expect(h.auth.signOut).not.toHaveBeenCalled();
		expect(h.jar[PASSWORD_RECOVERY_COOKIE]).toBe('1');
	});

	it('refuses to change a password when no recovery is in progress', async () => {
		const h = harness({ cookieJar: {} });

		const redirect = await redirectOf(() =>
			submit(h.actionEvent({ password: 'brand-new-pw', confirm_password: 'brand-new-pw' }))
		);

		expect(redirect.location).toBe('/login?error=recovery_link_invalid');
		expect(h.auth.updateUser).not.toHaveBeenCalled();
	});
});
