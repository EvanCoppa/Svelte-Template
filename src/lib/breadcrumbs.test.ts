import { describe, expect, it } from 'vitest';
import { MAX_CRUMBS, appendCrumb, breadcrumbs, type Crumb } from './breadcrumbs.svelte';

const crumb = (path: string, title = path): Crumb => ({ path, title });

/** Visiting these paths in order, from an empty trail. */
function walk(...paths: string[]): Crumb[] {
	return paths.reduce<Crumb[]>((trail, path) => appendCrumb(trail, crumb(path)), []);
}

describe('appendCrumb', () => {
	it('keeps the current page last', () => {
		expect(walk('/clients', '/deals').at(-1)).toEqual(crumb('/deals'));
	});

	it(`keeps at most ${MAX_CRUMBS} crumbs, dropping the oldest`, () => {
		expect(walk('/', '/clients', '/deals', '/tasks').map((c) => c.path)).toEqual([
			'/clients',
			'/deals',
			'/tasks'
		]);
	});

	it('moves a page already in the trail instead of repeating it', () => {
		expect(walk('/clients', '/deals', '/clients').map((c) => c.path)).toEqual([
			'/deals',
			'/clients'
		]);
	});

	it('re-titles a page visited again, without duplicating it', () => {
		const trail = appendCrumb(walk('/clients/42'), { path: '/clients/42', title: 'Acme Inc' });
		expect(trail).toEqual([{ path: '/clients/42', title: 'Acme Inc' }]);
	});

	it('leaves the trail it was given alone', () => {
		const trail = walk('/clients');
		appendCrumb(trail, crumb('/deals'));
		expect(trail).toEqual([crumb('/clients')]);
	});
});

describe('the trail', () => {
	it('starts empty, so the server renders what the client first hydrates', () => {
		expect(breadcrumbs.crumbsIn('user:acme')).toEqual([]);
	});

	it('records visits within a scope and starts over when the scope changes', () => {
		breadcrumbs.visit('user:acme', crumb('/clients'));
		breadcrumbs.visit('user:acme', crumb('/deals'));
		expect(breadcrumbs.crumbsIn('user:acme').map((c) => c.path)).toEqual(['/clients', '/deals']);

		// Another organization (or another user) is another trail: nothing from
		// the previous scope can be linked to from this one.
		breadcrumbs.visit('user:globex', crumb('/tasks'));
		expect(breadcrumbs.crumbsIn('user:globex').map((c) => c.path)).toEqual(['/tasks']);
	});

	it('shows nothing for a scope it is not holding, rather than the wrong pages', () => {
		breadcrumbs.visit('user:acme', crumb('/clients'));
		expect(breadcrumbs.crumbsIn('user:globex')).toEqual([]);
	});
});
