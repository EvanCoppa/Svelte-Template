import { createServerClient } from '@supabase/ssr';
import {
	error,
	redirect,
	type Handle,
	type HandleServerError,
	type RequestEvent
} from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '$lib/database.types';
import {
	DEV_AUTO_LOGIN_OPT_OUT_COOKIE,
	DEV_AUTO_LOGIN_RESET_PARAM,
	devAutoLogin,
	isDevAutoLoginEnabled,
	shouldAttemptDevAutoLogin
} from '$lib/server/dev-auto-login';
import { featureGateFor } from '$lib/features/gate';
import { readActiveOrg } from '$lib/server/active-org';
import { loadOrgContext } from '$lib/server/org-context';
import { isPasswordRecovery } from '$lib/server/password-recovery';
import { hasGrant } from '$lib/server/roles';
import { applySecurityHeaders } from '$lib/server/security-headers';

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
 *
 * Signed-in requests then pass the feature gate: the route's feature must
 * be enabled for the active org and readable by the user — see
 * `$lib/features/gate` and the features migration. A page is gated by being
 * registered, not by remembering a check in its load.
 */
const PUBLIC_PATHS = ['/login', '/auth'];

/**
 * The only pages a session that is mid password-recovery may reach: the form
 * itself, the link handler that starts the flow, and the exit hatch.
 */
const RECOVERY_ALLOWED_PATHS = ['/reset-password', '/auth/confirm', '/logout'];

/** Outermost handle so every rendered response carries the header set. */
const securityHeaders: Handle = async ({ event, resolve }) => {
	return applySecurityHeaders(await resolve(event), PUBLIC_SUPABASE_URL, { dev });
};

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						// SvelteKit requires an explicit path on set cookies.
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

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

/**
 * When DEV_AUTO_LOGIN is enabled, sign the configured user in instead of
 * bouncing the request to /login. Off by default and refused in production —
 * see `$lib/server/dev-auto-login`.
 */
async function maybeDevAutoLogin(event: RequestEvent) {
	if (!isDevAutoLoginEnabled()) return null;

	if (event.url.searchParams.has(DEV_AUTO_LOGIN_RESET_PARAM)) {
		event.cookies.delete(DEV_AUTO_LOGIN_OPT_OUT_COOKIE, { path: '/' });
	}

	const optedOut = event.cookies.get(DEV_AUTO_LOGIN_OPT_OUT_COOKIE) === '1';
	if (!shouldAttemptDevAutoLogin({ pathname: event.url.pathname, optedOut })) return null;

	return devAutoLogin(event.locals.supabase);
}

const authGuard: Handle = async ({ event, resolve }) => {
	let { session, user } = await event.locals.safeGetSession();

	if (!session || !user) {
		const bootstrapped = await maybeDevAutoLogin(event);
		if (bootstrapped) {
			session = bootstrapped.session;
			user = bootstrapped.user;
		}
	}

	event.locals.session = session;
	event.locals.user = user;
	// UI preference, not an auth decision — see the Locals doc in app.d.ts.
	event.locals.activeOrgId = user ? readActiveOrg(event.cookies) : null;
	event.locals.org = null;

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

	// Sign-out and the auth callbacks need no org, and API endpoints verify
	// membership themselves (RLS is the boundary there); every other page
	// request resolves the org context and is gated on it. `pathname` is
	// already stripped of `/__data.json`, so client-side navigations are gated
	// identically.
	if (!isPublic && !isApi && pathname !== '/logout') {
		event.locals.org = await loadOrgContext(event);
		const { features, access } = event.locals.org;
		const gate = featureGateFor(pathname, features, (featureId) => hasGrant(access, featureId));
		if (gate) {
			if ('redirectTo' in gate) throw redirect(303, gate.redirectTo);
			throw error(gate.status, gate.message);
		}
	}

	return resolve(event);
};

export const handle: Handle = sequence(securityHeaders, supabase, authGuard);
