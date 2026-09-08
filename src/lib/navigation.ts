import { isVisible } from '$lib/features/resolve';
import type { FeatureMap } from '$lib/features/types';

/**
 * The single source of truth for the sidebar and the ⌘K palette.
 *
 * Feature pages come from the feature registry (the `features` table): the
 * (app) layout calls `buildNav()` with the org's resolved feature map, so an
 * entry is linkable (enabled), locked with an upgrade prompt
 * (locked_visible), or absent (disabled, hidden, or no read grant). To add a
 * page: create the route, then register the feature by migration — see the
 * features migration's closing comment. Nothing here changes.
 *
 * `staticNavItems` are the pages that are not features: universal parts of
 * the shell every org gets. Icons are named, not imported — every slug
 * resolves through the one-per-file map in `$lib/features/icons`, so the
 * icon barrel never lands in the bundle. Categories render as labeled
 * sidebar sections in the order declared in NAV_CATEGORIES; empty categories
 * are omitted.
 *
 * Settings is deliberately NOT one of them. It is a shell of its own,
 * entered from the user menu in the sidebar footer, and once you are inside
 * it the sidebar becomes `settingsNav` below — so the app nav lists the
 * places you work, never the place you configure them.
 */

export type NavCategoryKey = 'platform' | 'library';

export const NAV_CATEGORIES: { key: NavCategoryKey; label: string }[] = [
	{ key: 'platform', label: 'Platform' },
	{ key: 'library', label: 'Library' }
];

export interface NavItem {
	label: string;
	href: string;
	category: NavCategoryKey;
	/** A lucide slug; `iconFor()` in `$lib/features/icons` turns it into a component. */
	icon: string;
	/** Position inside its category; features carry their registry sort_order. */
	sortOrder: number;
	/** Extra search keywords for the ⌘K palette. */
	aliases?: string[];
	/** Set when the entry is a registered feature. */
	featureId?: string;
	/** locked_visible: render with a lock; a click opens the upgrade prompt instead of navigating. */
	locked?: boolean;
}

export interface NavGroup {
	key: NavCategoryKey;
	label: string;
	items: NavItem[];
}

/** Pages that exist for every org regardless of industry, tier or role. */
export const staticNavItems: NavItem[] = [
	{
		label: 'Dashboard',
		href: '/',
		category: 'platform',
		icon: 'layout-dashboard',
		sortOrder: 0,
		aliases: ['home', 'overview']
	}
];

/**
 * The entries one session may see: the static pages plus every feature that
 * is enabled or locked for the org AND readable by the user (`isVisible()`,
 * the predicate the page titles and the terms share). Sorted by category
 * order, then sortOrder, then label — the one place filtering happens, so
 * components never check modes or grants themselves. The label is the
 * feature's name as the org's industry words it.
 */
export function buildNav(features: FeatureMap, canRead: (featureId: string) => boolean): NavItem[] {
	const featureItems: NavItem[] = Object.values(features)
		.filter((resolved) => isVisible(resolved, canRead))
		.map(({ mode, feature }) => ({
			label: feature.name,
			href: feature.route,
			category: isCategory(feature.category) ? feature.category : 'platform',
			icon: feature.icon ?? '',
			sortOrder: feature.sort_order,
			featureId: feature.id,
			locked: mode === 'locked_visible'
		}));

	const order = new Map(NAV_CATEGORIES.map((c, i) => [c.key, i]));
	return [...staticNavItems, ...featureItems].sort(
		(a, b) =>
			(order.get(a.category) ?? 0) - (order.get(b.category) ?? 0) ||
			a.sortOrder - b.sortOrder ||
			a.label.localeCompare(b.label)
	);
}

function isCategory(value: string): value is NavCategoryKey {
	return NAV_CATEGORIES.some((c) => c.key === value);
}

/** Buckets items into labeled sidebar sections; empty sections are omitted. */
export function groupNav(items: NavItem[]): NavGroup[] {
	return NAV_CATEGORIES.map((category) => ({
		...category,
		items: items.filter((item) => item.category === category.key)
	})).filter((group) => group.items.length > 0);
}

/**
 * Does `pathname` sit at `href`, or inside it? Exact match for the root
 * page, whole-segment prefix match for everything else — the one answer to
 * "does this pathname belong to that entry". The sidebars mark themselves
 * active with it, and the breadcrumb trail matches a declared jump against
 * the page that actually arrives (`startAt()` in `$lib/breadcrumbs.svelte`),
 * which a door like `/settings` may have redirected into a section.
 */
export function isPathUnder(href: string, pathname: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether a nav entry is the one the current pathname belongs to. */
export function isNavItemActive(item: { href: string }, pathname: string): boolean {
	return isPathUnder(item.href, pathname);
}

/**
 * The icon slug for the entry `pathname` sits at or under — the app nav and
 * the settings nav, whichever registers it. Longest `href` wins, the same
 * tie-break `matchPage()` uses for titles, so `/companies/42` inherits
 * Companies' icon rather than Dashboard's `/`. Used by the breadcrumb trail
 * to lead with the page's icon; a pathname neither nav lists (a record page
 * with no entry of its own) has none.
 */
export function iconForPath(pathname: string, nav: readonly NavItem[]): string | undefined {
	const candidates = [...nav, ...settingsNavItems()]
		.filter((item) => isPathUnder(item.href, pathname))
		.sort((a, b) => b.href.length - a.href.length);
	return candidates[0]?.icon;
}

/**
 * The settings shell's own nav — the second half of this file.
 *
 * Settings is entered from the user menu, and while you are under
 * `/settings` the sidebar swaps to these sections
 * (`$lib/components/settings-sidebar.svelte`). It is a hand-kept list, not a
 * registry read: these pages exist for every org regardless of industry,
 * tier or role, which is exactly why they are exempt from the feature gate
 * (see FEATURE_GATE_EXEMPT_PREFIXES in `$lib/features/gate`).
 *
 * Adding a settings page = the route under `(app)/settings/`, one entry
 * here, and its `pages` row by migration for the title. Groups render in
 * declared order.
 */
export interface SettingsNavItem {
	label: string;
	href: string;
	/** A lucide slug; `iconFor()` in `$lib/features/icons` turns it into a component. */
	icon: string;
	/** Extra search keywords for the ⌘K palette. */
	aliases?: string[];
}

export interface SettingsNavGroup {
	label: string;
	items: SettingsNavItem[];
}

export const settingsNav: SettingsNavGroup[] = [
	{
		label: 'Account',
		items: [
			{
				label: 'Profile',
				href: '/settings/profile',
				icon: 'circle-user',
				aliases: ['display name', 'email', 'account']
			},
			{
				label: 'Security',
				href: '/settings/security',
				icon: 'shield',
				aliases: ['password', 'sign in']
			},
			{
				label: 'Preferences',
				href: '/settings/preferences',
				icon: 'sliders-horizontal',
				aliases: ['theme', 'dark mode', 'notes rail', 'dock']
			}
		]
	},
	{
		label: 'Organization',
		items: [
			{
				label: 'Features',
				href: '/settings/features',
				icon: 'toggle-right',
				aliases: ['plan', 'modules', 'upgrade']
			}
		]
	}
];

/** Every settings entry, flattened — what the ⌘K palette lists. */
export function settingsNavItems(): SettingsNavItem[] {
	return settingsNav.flatMap((group) => group.items);
}
