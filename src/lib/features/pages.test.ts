import { describe, expect, it } from 'vitest';
import { matchPage, visiblePages } from './pages';
import type { Feature, FeatureMap, FeatureMode, PageMeta } from './types';

function page(id: string, path: string, featureId: string | null = null): PageMeta {
	return { id, feature_id: featureId, path, title: id };
}

function feature(id: string): Feature {
	return {
		id,
		name: id,
		description: null,
		route: `/${id}`,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z'
	};
}

function features(entries: [id: string, mode: FeatureMode][]): FeatureMap {
	return Object.fromEntries(entries.map(([id, mode]) => [id, { feature: feature(id), mode }]));
}

const registry: PageMeta[] = [
	page('dashboard', '/'),
	page('settings', '/settings'),
	page('settings-features', '/settings/features'),
	page('clients', '/clients', 'clients'),
	page('client-detail', '/clients/pipeline', 'clients'),
	page('deals', '/deals', 'deals'),
	page('tasks', '/tasks', 'tasks'),
	page('tickets', '/tickets', 'tickets')
];

describe('matchPage', () => {
	it('matches a path exactly', () => {
		expect(matchPage('/clients', registry)?.id).toBe('clients');
		expect(matchPage('/settings', registry)?.id).toBe('settings');
	});

	it('falls back to the page a nested path sits under', () => {
		expect(matchPage('/clients/42', registry)?.id).toBe('clients');
	});

	it('prefers the longest registered path', () => {
		expect(matchPage('/settings/features', registry)?.id).toBe('settings-features');
		expect(matchPage('/clients/pipeline/7', registry)?.id).toBe('client-detail');
	});

	it('never matches home as a prefix, nor a path as a partial segment', () => {
		expect(matchPage('/', registry)?.id).toBe('dashboard');
		expect(matchPage('/unregistered', registry)).toBeNull();
		expect(matchPage('/clientsx', registry)).toBeNull();
	});
});

describe('visiblePages', () => {
	const map = features([
		['clients', 'enabled'],
		['deals', 'locked_visible'],
		['tasks', 'disabled'],
		['tickets', 'hidden']
	]);

	it('keeps the shell pages, which belong to no feature', () => {
		const paths = visiblePages(registry, map, () => false).map((p) => p.path);
		expect(paths).toEqual(['/', '/settings', '/settings/features']);
	});

	it('keeps the pages of a feature the nav would show, and drops the rest', () => {
		const ids = visiblePages(registry, map, () => true).map((p) => p.id);
		expect(ids).toContain('clients');
		expect(ids).toContain('client-detail');
		// Locked features are linked (with an upgrade prompt), so they title too.
		expect(ids).toContain('deals');
		expect(ids).not.toContain('tasks');
		expect(ids).not.toContain('tickets');
	});

	it('drops a readable page whose feature is not in the registry', () => {
		expect(visiblePages([page('orphan', '/orphan', 'gone')], map, () => true)).toEqual([]);
	});

	it('drops an enabled feature the caller cannot read', () => {
		const ids = visiblePages(registry, map, (id) => id !== 'clients').map((p) => p.id);
		expect(ids).not.toContain('clients');
		expect(ids).toContain('deals');
	});
});
