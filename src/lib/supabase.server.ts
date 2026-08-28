import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * ⚠️ Service-role client — bypasses Row Level Security.
 *
 * Server-only (this file is `*.server.ts`, so SvelteKit refuses to bundle it
 * client-side). Create one per request inside the action/endpoint that needs
 * it; never cache it in a module-level variable and never pass its data to the
 * client without an authorization check of your own, because RLS is not there
 * to catch mistakes.
 */
export function createSupabaseAdminClient() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set to use the admin client.');
	}
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}
