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
	org: 'app:org',
	staff: 'app:staff',
	/** The resolved feature map — the org's own opt-outs change it. */
	features: 'app:features',
	clients: 'app:clients',
	deals: 'app:deals',
	tasks: 'app:tasks',
	tickets: 'app:tickets'
} as const;
