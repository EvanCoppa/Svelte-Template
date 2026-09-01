import type { Component } from 'svelte';
import BlocksIcon from '@lucide/svelte/icons/blocks';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import SettingsIcon from '@lucide/svelte/icons/settings';

/**
 * The single source of truth for the sidebar and the ⌘K palette.
 *
 * To add a page: create the route, then add one item here. Import its icon
 * one-per-file (`@lucide/svelte/icons/...`) so the icon barrel never lands in
 * the bundle. Categories render as labeled sidebar sections in the order
 * declared in NAV_CATEGORIES; empty categories are omitted.
 *
 * To hide pages by permission (`src/lib/server/roles.ts`), add a
 * `permission?: string` field here and filter in one place before grouping —
 * never scatter per-item permission checks through components.
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
	icon: Component<{ class?: string }>;
	/** Extra search keywords for the ⌘K palette. */
	aliases?: string[];
}

export interface NavGroup {
	key: NavCategoryKey;
	label: string;
	items: NavItem[];
}

export const navItems: NavItem[] = [
	{
		label: 'Dashboard',
		href: '/',
		category: 'platform',
		icon: LayoutDashboardIcon,
		aliases: ['home', 'overview']
	},
	{
		label: 'Settings',
		href: '/settings',
		category: 'platform',
		icon: SettingsIcon,
		aliases: ['account', 'password', 'profile']
	},
	{
		label: 'Components',
		href: '/components',
		category: 'library',
		icon: BlocksIcon,
		aliases: [
			'ui',
			'shadcn',
			'showcase',
			'kitchen sink',
			'enhanced',
			'primitives',
			'interior',
			'motion',
			'solid core',
			'otp',
			'tags'
		]
	},
	{
		label: 'Best Practices',
		href: '/best-practices',
		category: 'library',
		icon: BookOpenIcon,
		aliases: ['docs', 'notes', 'guide', 'sveltekit']
	}
];

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
