import type { Cookies } from '@sveltejs/kit';

/**
 * Password-recovery pinning.
 *
 * Verifying a recovery link mints an ordinary session, so a user who clicked
 * "forgot password" is now signed in under the password they forgot. This
 * cookie marks the browser as "mid-recovery"; the auth guard in
 * `hooks.server.ts` pins such a browser to /reset-password until a new
 * password is chosen, otherwise the emailed link quietly works as a standing
 * magic sign-in link.
 */
export const PASSWORD_RECOVERY_COOKIE = 'sb-password-recovery';
export const PASSWORD_RECOVERY_MAX_AGE = 60 * 30;
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt (what Supabase Auth hashes with) silently truncates at 72 *bytes*.
 * Rejecting longer input beats accepting a passphrase whose tail is never
 * actually read.
 */
export const PASSWORD_MAX_BYTES = 72;

export function startPasswordRecovery(cookies: Pick<Cookies, 'set'>): void {
	cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: PASSWORD_RECOVERY_MAX_AGE
	});
}

export function isPasswordRecovery(cookies: Pick<Cookies, 'get'>): boolean {
	return cookies.get(PASSWORD_RECOVERY_COOKIE) === '1';
}

export function endPasswordRecovery(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(PASSWORD_RECOVERY_COOKIE, { path: '/' });
}

export function validateNewPassword(password: string, confirmation: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`;
	}
	if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
		return `Password must be at most ${String(PASSWORD_MAX_BYTES)} bytes.`;
	}
	if (password !== confirmation) {
		return 'Passwords do not match.';
	}
	return null;
}
