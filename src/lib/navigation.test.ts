import { describe, expect, it } from 'vitest';
import type { FeatureMap, FeatureMode } from './features/types';
import { isIconName } from './features/icons';
import {
	buildNav,
	groupNav,
	isNavItemActive,
	settingsNav,
	settingsNavItems,
	staticNavItems
} from './navigation';

function map(
	entries: [id: string, mode: FeatureMode, extra?: { category?: string; sort?: number }][]
): FeatureMap {
	return Object.fromEntries(
		entries.map(([id, mode, extra]) => [
			id,
			{
				mode,
				feature: {
					id,
					name: id[0].toUpperCase() + id.slice(1),
					description: null,
					route: `/${id}`,
					icon: 'users',
					category: extra?.category ?? 'platform',
					sort_order: extra?.sort ?? 0,
					created_at: ''
				}
			}
		])
	);
}

const readAll = () => true;

describe('buildNav', () => {
	it('lists enabled and locked features and drops disabled and hidden ones', () => {
		const nav = buildNav(
			map([
				['companies', 'enabled'],
				['deals', 'locked_visible'],
				['tasks', 'disabled'],
				['tickets', 'hidden']
			]),
			readAll
		);
		const features = nav.filter((i) => i.featureId);
		expect(features.map((i) => [i.featureId, i.locked])).toEqual([
			['companies', false],
			['deals', true]
		]);
	});

	it('hides features the user has no read grant on, locked ones included', () => {
		const nav = buildNav(
			map([
				['companies', 'enabled'],
				['deals', 'locked_visible']
			]),
			(id) => id === 'companies'
		);
		expect(nav.filter((i) => i.featureId).map((i) => i.featureId)).toEqual(['companies']);
	});

	it('keeps the static pages and orders by category, then sortOrder, then label', () => {
		const nav = buildNav(
			map([
				['zeta', 'enabled', { sort: 10 }],
				['alpha', 'enabled', { sort: 10 }],
				['docs', 'enabled', { category: 'library', sort: 1 }],
				['early', 'enabled', { sort: 5 }]
			]),
			readAll
		);
		expect(nav.map((i) => i.label)).toEqual(['Dashboard', 'Early', 'Alpha', 'Zeta', 'Docs']);
		expect(groupNav(nav).map((g) => [g.key, g.items.length])).toEqual([
			['platform', 4],
			['library', 1]
		]);
	});

	it('falls back to the platform section for an unknown category', () => {
		const nav = buildNav(map([['odd', 'enabled', { category: 'mystery' }]]), readAll);
		expect(nav.find((i) => i.featureId === 'odd')?.category).toBe('platform');
	});

	it('returns only the static pages for an empty map', () => {
		expect(buildNav({}, readAll)).toEqual(staticNavItems);
	});
});

describe('isNavItemActive', () => {
	const [dashboard] = staticNavItems;
	const staff = buildNav(map([['staff', 'enabled']]), readAll).find(
		(i) => i.featureId === 'staff'
	)!;

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

describe('settingsNav', () => {
	it('stays out of the app nav — settings is entered from the user menu', () => {
		const nav = buildNav(map([['companies', 'enabled']]), readAll);
		expect(nav.some((item) => item.href.startsWith('/settings'))).toBe(false);
	});

	it('lists every section under /settings with an icon the app ships', () => {
		const items = settingsNavItems();
		expect(items.length).toBe(settingsNav.reduce((n, g) => n + g.items.length, 0));
		for (const item of items) {
			expect(item.href.startsWith('/settings/')).toBe(true);
			expect(isIconName(item.icon)).toBe(true);
		}
	});

	it('marks the section you are on, and only that one', () => {
		const [profile, security] = settingsNav[0].items;
		expect(isNavItemActive(profile, '/settings/profile')).toBe(true);
		expect(isNavItemActive(security, '/settings/profile')).toBe(false);
	});
});
