import { redirect } from '@sveltejs/kit';
import { DEV_AUTO_LOGIN_OPT_OUT_COOKIE, isDevAutoLoginEnabled } from '$lib/server/dev-auto-login';
import type { RequestHandler } from './$types';

// POST-only, so a prefetched or crawled link can never sign the user out.
export const POST: RequestHandler = async ({ locals: { supabase }, cookies }) => {
	// Scope 'local' ends this browser's session only. The default ('global')
	// revokes every session the user has — surprising UX for a logout button,
	// and it makes concurrent sessions (other devices, parallel E2E workers
	// signed in as the same seed user) fail mid-flight.
	await supabase.auth.signOut({ scope: 'local' });

	// With auto-login on, an explicit sign-out has to stick — otherwise the
	// guard would immediately sign the browser back in. Cleared with
	// `?autologin=1` on any page.
	if (isDevAutoLoginEnabled()) {
		cookies.set(DEV_AUTO_LOGIN_OPT_OUT_COOKIE, '1', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});
	}

	throw redirect(303, '/login');
};
