import { describe, expect, it } from 'vitest';
import type { FeatureMap, FeatureMode } from './features/types';
import { buildNav, groupNav, isNavItemActive, navItemTarget, staticNavItems } from './navigation';

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
				['clients', 'enabled'],
				['deals', 'locked_visible'],
				['tasks', 'disabled'],
				['tickets', 'hidden']
			]),
			readAll
		);
		const features = nav.filter((i) => i.featureId);
		expect(features.map((i) => [i.featureId, i.locked])).toEqual([
			['clients', false],
			['deals', true]
		]);
	});

	it('hides features the user has no read grant on, locked ones included', () => {
		const nav = buildNav(
			map([
				['clients', 'enabled'],
				['deals', 'locked_visible']
			]),
			(id) => id === 'clients'
		);
		expect(nav.filter((i) => i.featureId).map((i) => i.featureId)).toEqual(['clients']);
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
		expect(nav.map((i) => i.label)).toEqual([
			'Dashboard',
			'Early',
			'Alpha',
			'Zeta',
			'Settings',
			'Docs'
		]);
		expect(groupNav(nav).map((g) => [g.key, g.items.length])).toEqual([
			['platform', 5],
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

describe('navItemTarget', () => {
	it('sends locked entries to the upgrade page and the rest to their own', () => {
		const nav = buildNav(
			map([
				['clients', 'enabled'],
				['best-practices', 'locked_visible']
			]),
			readAll
		);
		const item = (id: string) => nav.find((i) => i.featureId === id)!;
		expect(navItemTarget(item('clients'))).toBe('/clients');
		expect(navItemTarget(item('best-practices'))).toBe('/upgrade?feature=best-practices');
		expect(navItemTarget(staticNavItems[0])).toBe('/');
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
