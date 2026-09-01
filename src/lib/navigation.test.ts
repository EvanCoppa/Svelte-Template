import { describe, expect, it } from 'vitest';
import UsersIcon from '@lucide/svelte/icons/users';
import { groupNav, isNavItemActive, navItems, visibleNavItems, type NavItem } from './navigation';

// A real icon component: the filter never renders, but using the genuine
// type keeps these fixtures honest NavItems.
const icon = UsersIcon;

const dashboard: NavItem = { label: 'Dashboard', href: '/', category: 'platform', icon };
const staff: NavItem = {
	label: 'Staff',
	href: '/staff',
	category: 'platform',
	icon,
	permission: 'staff'
};

describe('visibleNavItems', () => {
	it('keeps ungated items regardless of what the user holds', () => {
		expect(visibleNavItems([dashboard], [])).toEqual([dashboard]);
	});

	it('hides a gated item from a user without its permission', () => {
		expect(visibleNavItems([dashboard, staff], [])).toEqual([dashboard]);
	});

	it('shows a gated item to a user holding its permission', () => {
		expect(visibleNavItems([dashboard, staff], ['staff'])).toEqual([dashboard, staff]);
	});

	it('leaves the real nav list intact for a user with every permission', () => {
		expect(visibleNavItems(navItems, ['staff'])).toHaveLength(navItems.length);
	});

	it('drops /staff from the real nav list for a user with none', () => {
		expect(visibleNavItems(navItems, []).map((item) => item.href)).not.toContain('/staff');
	});
});

describe('groupNav', () => {
	it('omits a category whose only item was filtered out', () => {
		const libraryOnly: NavItem = { label: 'Docs', href: '/docs', category: 'library', icon };
		const groups = groupNav(visibleNavItems([staff, libraryOnly], []));
		expect(groups.map((g) => g.key)).toEqual(['library']);
	});
});

describe('isNavItemActive', () => {
	it('matches the root item exactly, never as a prefix', () => {
		expect(isNavItemActive(dashboard, '/')).toBe(true);
		expect(isNavItemActive(dashboard, '/staff')).toBe(false);
	});

	it('matches a section item on its own path and its children', () => {
		expect(isNavItemActive(staff, '/staff')).toBe(true);
		expect(isNavItemActive(staff, '/staff/123')).toBe(true);
		expect(isNavItemActive(staff, '/staffing')).toBe(false);
	});
});
