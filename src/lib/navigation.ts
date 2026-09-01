import type { Component } from 'svelte';
import BlocksIcon from '@lucide/svelte/icons/blocks';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import SettingsIcon from '@lucide/svelte/icons/settings';
import UsersIcon from '@lucide/svelte/icons/users';
import type { PermissionId } from '$lib/permissions';

/**
 * The single source of truth for the sidebar and the ⌘K palette.
 *
 * To add a page: create the route, then add one item here. Import its icon
 * one-per-file (`@lucide/svelte/icons/...`) so the icon barrel never lands in
 * the bundle. Categories render as labeled sidebar sections in the order
 * declared in NAV_CATEGORIES; empty categories are omitted.
 *
 * A page gated by a permission (`src/lib/server/roles.ts`) carries its key in
 * `permission`; `visibleNavItems()` drops it for users without `read`. That
 * filter runs in ONE place — the (app) layout hands `page.data.permissions`
 * to both consumers — so per-item permission checks never scatter through
 * components. It is navigation only: the page's own load still calls
 * `requirePermission`, which is what actually denies access.
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
	/** Permission the page needs at `read`. Ungated pages omit it. */
	permission?: PermissionId;
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
		label: 'Staff',
		href: '/staff',
		category: 'platform',
		icon: UsersIcon,
		aliases: ['team', 'members', 'people', 'users', 'invite', 'roles', 'permissions'],
		permission: 'staff'
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

/**
 * Drops the items whose permission the user does not hold at `read`.
 * `permissions` is the readable-key list from the (app) layout load, which
 * already resolved the owner/admin bypass server-side.
 */
export function visibleNavItems(items: NavItem[], permissions: readonly PermissionId[]): NavItem[] {
	return items.filter((item) => !item.permission || permissions.includes(item.permission));
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
