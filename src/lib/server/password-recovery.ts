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
 *
 * The password rules themselves live in `$lib/schemas/password` (shared with
 * the client for superforms validation).
 */
export const PASSWORD_RECOVERY_COOKIE = 'sb-password-recovery';
export const PASSWORD_RECOVERY_MAX_AGE = 60 * 30;

export function startPasswordRecovery(cookies: Cookies): void {
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

export function endPasswordRecovery(cookies: Cookies): void {
	cookies.delete(PASSWORD_RECOVERY_COOKIE, { path: '/' });
}
