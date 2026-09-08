import { describe, expect, it } from 'vitest';
import { matchPage, visiblePages } from './pages';
import type { Feature, FeatureMap, FeatureMode, PageMeta, PageRow } from './types';

function page(
	id: string,
	path: string,
	featureId: string | null = null,
	title: string | null = id
): PageRow {
	return { id, feature_id: featureId, path, title };
}

function feature(id: string, name = id): Feature {
	return {
		id,
		name,
		noun: null,
		description: null,
		route: `/${id}`,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z'
	};
}

function features(entries: [id: string, mode: FeatureMode, name?: string][]): FeatureMap {
	return Object.fromEntries(
		entries.map(([id, mode, name]) => [id, { feature: feature(id, name), mode }])
	);
}

const registry: PageMeta[] = [
	page('dashboard', '/'),
	page('settings', '/settings'),
	page('settings-features', '/settings/features'),
	page('companies', '/companies', 'companies'),
	page('company-detail', '/companies/pipeline', 'companies'),
	page('deals', '/deals', 'deals'),
	page('tasks', '/tasks', 'tasks'),
	page('tickets', '/tickets', 'tickets')
].map((row) => ({ ...row, title: row.title ?? row.id }));

describe('matchPage', () => {
	it('matches a path exactly', () => {
		expect(matchPage('/companies', registry)?.id).toBe('companies');
		expect(matchPage('/settings', registry)?.id).toBe('settings');
	});

	it('falls back to the page a nested path sits under', () => {
		expect(matchPage('/companies/42', registry)?.id).toBe('companies');
	});

	it('prefers the longest registered path', () => {
		expect(matchPage('/settings/features', registry)?.id).toBe('settings-features');
		expect(matchPage('/companies/pipeline/7', registry)?.id).toBe('company-detail');
	});

	it('never matches home as a prefix, nor a path as a partial segment', () => {
		expect(matchPage('/', registry)?.id).toBe('dashboard');
		expect(matchPage('/unregistered', registry)).toBeNull();
		expect(matchPage('/clientsx', registry)).toBeNull();
	});
});

describe('visiblePages', () => {
	const map = features([
		['companies', 'enabled'],
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
		expect(ids).toContain('companies');
		expect(ids).toContain('company-detail');
		// Locked features are linked (with an upgrade prompt), so they title too.
		expect(ids).toContain('deals');
		expect(ids).not.toContain('tasks');
		expect(ids).not.toContain('tickets');
	});

	it('drops a readable page whose feature is not in the registry', () => {
		expect(visiblePages([page('orphan', '/orphan', 'gone')], map, () => true)).toEqual([]);
	});

	it('drops an enabled feature the caller cannot read', () => {
		const ids = visiblePages(registry, map, (id) => id !== 'companies').map((p) => p.id);
		expect(ids).not.toContain('companies');
		expect(ids).toContain('deals');
	});

	it('titles a page with no title of its own after its feature, as the industry names it', () => {
		const quotes = features([['proposals', 'enabled', 'Quotes']]);
		const [shown] = visiblePages(
			[page('proposals', '/proposals', 'proposals', null)],
			quotes,
			() => true
		);
		expect(shown.title).toBe('Quotes');
	});

	it("keeps a page's own title over its feature's name", () => {
		const quotes = features([['proposals', 'enabled', 'Quotes']]);
		const [shown] = visiblePages(
			[page('proposal-decks', '/proposals/decks', 'proposals', 'Decks')],
			quotes,
			() => true
		);
		expect(shown.title).toBe('Decks');
	});

	it('drops a shell row with no title, which the check constraint already forbids', () => {
		expect(visiblePages([page('blank', '/blank', null, null)], map, () => true)).toEqual([]);
	});
});
