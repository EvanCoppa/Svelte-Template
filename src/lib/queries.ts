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
	/** The signed-in user's account preferences (docs/user-preferences.md). */
	preferences: 'app:preferences',
	companies: 'app:companies',
	contacts: 'app:contacts',
	products: 'app:products',
	deals: 'app:deals',
	proposals: 'app:proposals',
	billables: 'app:billables',
	quickPlans: 'app:quick-plans',
	/** Every note the session can see: the dock's rail and the /notes page share it. */
	notes: 'app:notes',
	tasks: 'app:tasks',
	tickets: 'app:tickets',
	/** One CRM record of any kind, as the generic record page shows it. */
	record: (kind: string, id: string) => `app:records:${kind}:${id}` as const,
	/** The signed-in member's assistant conversations — the history rail and a thread's title. */
	assistant: 'app:assistant'
} as const;
