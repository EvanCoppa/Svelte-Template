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
	/** The events overlapping the calendar's visible range — a move, an edit or a new booking changes it. */
	calendar: 'app:calendar',
	companies: 'app:companies',
	contacts: 'app:contacts',
	products: 'app:products',
	deals: 'app:deals',
	proposals: 'app:proposals',
	billables: 'app:billables',
	quickPlans: 'app:quick-plans',
	/** The org's one slide deck — the builder saves it, the presenter reads it. */
	slides: 'app:slides',
	invoices: 'app:invoices',
	/** Every charge and payment on the ledger — an invoice issued or voided, a payment recorded or applied, changes it. */
	ledger: 'app:ledger',
	assets: 'app:assets',
	/** What customers asked for — a line, a split or a shipment moves the header. */
	orders: 'app:orders',
	/** Boxes going out — packing one or a carrier scan moves its order too. */
	shipments: 'app:shipments',
	/** The org's merchandising shelves — a group's members change with the group. */
	featuredGroups: 'app:featured-groups',
	/** The catalog tree — a category added, moved or removed changes it. */
	categories: 'app:categories',
	coupons: 'app:coupons',
	/** What the org buys from its vendors — a line received moves the header too. */
	purchases: 'app:purchases',
	/** Returns coming back from customers. */
	rmas: 'app:rmas',
	/** The portfolio — buildings and the units inside them, which are rows in the same list. */
	properties: 'app:properties',
	/** The rent roll: every tenancy, running, upcoming or ended. */
	leases: 'app:leases',
	/** Every note the session can see: the dock's rail and the /notes page share it. */
	notes: 'app:notes',
	/** The bell's inbox — reading, dismissing or restoring one changes it. */
	notifications: 'app:notifications',
	tasks: 'app:tasks',
	tickets: 'app:tickets',
	/** Where people went — logging one, or booking the next, changes it. */
	visits: 'app:visits',
	/** One CRM record of any kind, as the generic record page shows it. */
	record: (kind: string, id: string) => `app:records:${kind}:${id}` as const,
	/** The signed-in member's assistant conversations — the history rail and a thread's title. */
	assistant: 'app:assistant',
	/**
	 * The platform area's organization directory and detail page
	 * (docs/platform-administration.md) — changed by the one mutation there,
	 * moving an organization to another plan. Its own `admin:` domain: this
	 * is platform data, read outside any tenant, and nothing under `app:`
	 * depends on it.
	 */
	adminOrganizations: 'admin:organizations',
	/**
	 * The platform's reference catalogs as the platform area edits them: the
	 * plans, the verticals and the feature registry. One key for the three
	 * because they are one graph — moving a feature between plans changes
	 * what every directory of them reads — and because only an operator ever
	 * looks at them. The tenant side has its own key for the resolved answer
	 * (`features`), which a catalog edit changes on the org's next request,
	 * not in this browser.
	 */
	adminCatalog: 'admin:catalog'
} as const;
