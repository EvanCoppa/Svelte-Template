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
	/** locked_visible: render with a lock and send clicks to the upgrade page. */
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
	},
	{
		label: 'Settings',
		href: '/settings',
		category: 'platform',
		icon: 'settings',
		sortOrder: 900,
		aliases: ['account', 'password', 'profile', 'features', 'plan']
	}
];

/**
 * The entries one session may see: the static pages plus every feature that
 * is enabled or locked for the org AND readable by the user. Sorted by
 * category order, then sortOrder, then label — the one place filtering
 * happens, so components never check modes or grants themselves.
 */
export function buildNav(features: FeatureMap, canRead: (featureId: string) => boolean): NavItem[] {
	const featureItems: NavItem[] = Object.values(features)
		.filter(
			({ mode, feature }) =>
				(mode === 'enabled' || mode === 'locked_visible') && canRead(feature.id)
		)
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

/** Exact match for the root page, prefix match for everything else. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
	if (item.href === '/') return pathname === '/';
	return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The upgrade page for a locked entry, or the entry's own page. */
export function navItemTarget(item: NavItem): string {
	return item.locked && item.featureId
		? `/upgrade?feature=${encodeURIComponent(item.featureId)}`
		: item.href;
}
