import { createServerClient } from '@supabase/ssr';
import { error, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { isPasswordRecovery } from '$lib/server/password-recovery';

/**
 * Server errors get an opaque code the user can report; the detail stays in
 * the server log. Never leak internals (stack traces, query text) to clients.
 */
export const handleError: HandleServerError = ({ error: err, event, status, message }) => {
	const code = `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	if (status >= 500) {
		console.error('[server-error]', {
			code,
			status,
			message,
			path: event.url.pathname,
			method: event.request.method,
			userId: event.locals.user?.id ?? null,
			err
		});
	}
	return { message: message ?? 'Unexpected server error.', code };
};

/**
 * Everything is private by default. List the routes an anonymous visitor may
 * reach; a new page is protected unless you add it here. Prefix match.
 */
const PUBLIC_PATHS = ['/login', '/auth'];

/**
 * The only pages a session that is mid password-recovery may reach: the form
 * itself, the link handler that starts the flow, and the exit hatch.
 */
const RECOVERY_ALLOWED_PATHS = ['/reset-password', '/auth/confirm', '/logout'];

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					// SvelteKit requires an explicit path on set cookies.
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	/**
	 * Unlike `getSession()` alone — which returns the cookie's contents without
	 * validating the JWT — this also calls `getUser()`, which verifies the token
	 * with the Auth server before we trust it.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error: userError
		} = await event.locals.supabase.auth.getUser();
		if (userError) {
			// JWT validation failed.
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const pathname = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
	const isApi = pathname.startsWith('/api/');

	if (!session || !user) {
		if (!isPublic) {
			// API callers get a status code, not a login page.
			if (isApi) throw error(401, 'Not signed in.');
			// Reaching the reset form with no session means the recovery link never
			// took. Say that, rather than bouncing to login with a `next` the user
			// has no way to satisfy.
			if (pathname === '/reset-password') {
				throw redirect(303, '/login?error=recovery_link_invalid');
			}
			const next = encodeURIComponent(pathname + event.url.search);
			throw redirect(303, `/login?next=${next}`);
		}
		return resolve(event);
	}

	// A browser that verified a recovery link is signed in under the password
	// the user forgot. Pin it to the reset form until a new password is set.
	if (isPasswordRecovery(event.cookies)) {
		if (RECOVERY_ALLOWED_PATHS.includes(pathname)) return resolve(event);
		if (isApi) throw error(403, 'Finish resetting your password first.');
		throw redirect(303, '/reset-password');
	}

	// Signed-in users have no business on the login page.
	if (pathname === '/login') {
		throw redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
