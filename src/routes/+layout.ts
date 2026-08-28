import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '$lib/database.types';
import { QUERY } from '$lib/queries';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	/**
	 * Query key for auth state. `onAuthStateChange` in +layout.svelte calls
	 * `invalidate('supabase:auth')` when the session changes, which re-runs this
	 * load (and any other load that declares the same dependency).
	 * See docs/data-invalidation.md for the convention.
	 */
	depends(QUERY.auth);

	const supabase = isBrowser()
		? createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
				global: { fetch }
			})
		: createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
				global: { fetch },
				cookies: {
					getAll: () => data.cookies
				}
			});

	/**
	 * `getSession()` is fine here: on the client it reads local storage/cookies
	 * it owns, and on the server it reads cookies already verified by
	 * `safeGetSession` in hooks. For authorization decisions, use `data.user`
	 * (server-verified), never `session.user`.
	 */
	const {
		data: { session }
	} = await supabase.auth.getSession();

	return { supabase, session, user: data.user };
};
