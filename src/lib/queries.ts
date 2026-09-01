/**
 * Query keys — named load dependencies. The full convention lives in
 * docs/data-invalidation.md; the short version:
 *
 *   depends(QUERY.profile)      // in the load that owns the data
 *   invalidate(QUERY.profile)   // at the event source that changed it
 *
 * Shape: `<domain>:<entity>[:<id>]`. `supabase:` is reserved for the auth
 * layer; application data lives under `app:`.
 */
export const QUERY = {
	auth: 'supabase:auth',
	profile: 'app:profile',
	org: 'app:org'
} as const;
