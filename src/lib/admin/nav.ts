import { isPathUnder } from '$lib/navigation';

/**
 * The platform area's own navigation — the whole of it.
 *
 * A hand-kept list, never a registry read, for the reason `settingsNav` is
 * one: these pages are not features. They have no tier, no industry, no
 * per-org mode and no read grant — they exist for the platform, and the one
 * thing that decides whether you may see them is whether you are a system
 * admin (`requireSystemAdmin()` in `$lib/server/admin/guard`). Nothing here
 * ever reaches the tenant sidebar or the ⌘K palette.
 *
 * The labels are also the page names: the `(admin)` layout load titles each
 * page with `adminTitleFor()`, so the bar, the document title and the page
 * heading say the same word — the one-name-per-page rule the `pages`
 * registry gives the tenant shell, kept without a registry. A page whose
 * name depends on a record (an organization's detail) returns its own
 * `title`, and page data wins over the layout's exactly as it does in `(app)`.
 *
 * Adding an admin page = the route under `src/routes/(admin)/admin/` plus
 * one entry here. No migration: `/admin` is outside the feature registry
 * and outside the `pages` table on purpose.
 */
export interface AdminNavItem {
	label: string;
	href: string;
	/** A lucide slug; `iconFor()` in `$lib/features/icons` turns it into a component. */
	icon: string;
}

/** The platform area's identity, said once. */
export const ADMIN_AREA_NAME = 'Platform Administration';

/** Where the platform area starts, and where the org picker's entry points. */
export const ADMIN_HOME = '/admin';

export const adminNav: AdminNavItem[] = [
	{ label: 'Overview', href: ADMIN_HOME, icon: 'layout-dashboard' },
	{ label: 'Organizations', href: '/admin/organizations', icon: 'building-2' },
	{ label: 'Tiers', href: '/admin/tiers', icon: 'layers' },
	{ label: 'Industries', href: '/admin/industries', icon: 'blocks' },
	{ label: 'Features', href: '/admin/features', icon: 'toggle-right' }
];

/**
 * Does `pathname` belong to this entry? Whole-segment prefix match, except
 * for `/admin` itself: the area's root would otherwise claim every page
 * under it — both as the highlighted bar entry and as every page's title —
 * so it matches exactly, the rule `matchPage()` gives '/' for the same
 * reason.
 */
export function isAdminItemActive(item: { href: string }, pathname: string): boolean {
	return item.href === ADMIN_HOME ? pathname === ADMIN_HOME : isPathUnder(item.href, pathname);
}

/** The platform area's page for one organization — the only linkable record it has. */
export function adminOrganizationHref(id: string): string {
	return `/admin/organizations/${id}`;
}

/**
 * What the page at `pathname` is called: the entry it sits at or under,
 * longest href first — the same tie-break `matchPage()` uses for titles, so
 * `/admin/organizations/<id>` inherits Organizations until its own load
 * names the organization. Anything under `/admin` that no entry claims
 * falls back to the area's own name.
 */
export function adminTitleFor(pathname: string): string {
	const match = [...adminNav]
		.sort((a, b) => b.href.length - a.href.length)
		.find((item) => isAdminItemActive(item, pathname));
	return match?.label ?? ADMIN_AREA_NAME;
}
