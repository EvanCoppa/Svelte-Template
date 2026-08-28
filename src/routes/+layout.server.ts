import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	return {
		// Verified by `safeGetSession` in hooks.server.ts — safe to trust.
		session: locals.session,
		user: locals.user,
		// Passed to +layout.ts so the server-side client there can read auth
		// cookies during SSR.
		cookies: cookies.getAll()
	};
};
