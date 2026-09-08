import { describe, expect, it } from 'vitest';
import { MAX_CRUMBS, appendCrumb, breadcrumbs, type Crumb } from './breadcrumbs.svelte';

const crumb = (path: string, title = path): Crumb => ({ path, title });

/** Stepping deeper through these paths in order, from an empty trail. */
function walk(...paths: string[]): Crumb[] {
	return paths.reduce<Crumb[]>((trail, path) => appendCrumb(trail, crumb(path)), []);
}

describe('appendCrumb', () => {
	it('keeps the current page last', () => {
		expect(walk('/companies', '/deals').at(-1)).toEqual(crumb('/deals'));
	});

	it(`keeps at most ${MAX_CRUMBS} crumbs, dropping the oldest`, () => {
		expect(walk('/', '/companies', '/deals', '/tasks').map((c) => c.path)).toEqual([
			'/companies',
			'/deals',
			'/tasks'
		]);
	});

	it('truncates back to a page already in the trail instead of repeating it', () => {
		expect(walk('/companies', '/companies/42', '/companies').map((c) => c.path)).toEqual([
			'/companies'
		]);
	});

	it('re-titles a page visited again, without duplicating it', () => {
		const trail = appendCrumb(walk('/companies/42'), { path: '/companies/42', title: 'Acme Inc' });
		expect(trail).toEqual([{ path: '/companies/42', title: 'Acme Inc' }]);
	});

	it('leaves the trail it was given alone', () => {
		const trail = walk('/companies');
		appendCrumb(trail, crumb('/deals'));
		expect(trail).toEqual([crumb('/companies')]);
	});
});

describe('the trail', () => {
	it('starts empty, so the server renders what the client first hydrates', () => {
		expect(breadcrumbs.crumbsIn('user:acme')).toEqual([]);
	});

	it('records visits within a scope and starts over when the scope changes', () => {
		breadcrumbs.visit('user:acme', crumb('/companies'));
		breadcrumbs.visit('user:acme', crumb('/companies/42'));
		expect(breadcrumbs.crumbsIn('user:acme').map((c) => c.path)).toEqual([
			'/companies',
			'/companies/42'
		]);

		// Another organization (or another user) is another trail: nothing from
		// the previous scope can be linked to from this one.
		breadcrumbs.visit('user:globex', crumb('/tasks'));
		expect(breadcrumbs.crumbsIn('user:globex').map((c) => c.path)).toEqual(['/tasks']);
	});

	it('shows nothing for a scope it is not holding, rather than the wrong pages', () => {
		breadcrumbs.visit('user:acme', crumb('/companies'));
		expect(breadcrumbs.crumbsIn('user:globex')).toEqual([]);
	});

	it('starts over at a page jumped to from the shell, however deep it was', () => {
		const scope = 'jump:acme';
		breadcrumbs.visit(scope, crumb('/companies'));
		breadcrumbs.visit(scope, crumb('/companies/42'));

		breadcrumbs.startAt('/deals');
		breadcrumbs.visit(scope, crumb('/deals'));
		expect(breadcrumbs.crumbsIn(scope).map((c) => c.path)).toEqual(['/deals']);
	});

	it('keeps the page a walk started from when the next step is not a jump', () => {
		const scope = 'deeper:acme';
		breadcrumbs.startAt('/treatments');
		breadcrumbs.visit(scope, crumb('/treatments'));
		breadcrumbs.visit(scope, crumb('/contacts/42'));
		expect(breadcrumbs.crumbsIn(scope).map((c) => c.path)).toEqual(['/treatments', '/contacts/42']);
	});

	it('spends a declared jump on the next navigation, wherever it lands', () => {
		const scope = 'stale:acme';
		// The jump was announced but something else arrived (a redirect, say),
		// so it is recorded as an ordinary step...
		breadcrumbs.startAt('/deals');
		breadcrumbs.visit(scope, crumb('/companies'));
		// ...and cannot restart the trail at a later step that happens to match.
		breadcrumbs.visit(scope, crumb('/deals'));
		expect(breadcrumbs.crumbsIn(scope).map((c) => c.path)).toEqual(['/companies', '/deals']);
	});

	it('rewinds to the crumb a back navigation lands on', () => {
		const scope = 'back:acme';
		breadcrumbs.visit(scope, crumb('/companies'));
		breadcrumbs.visit(scope, crumb('/companies/42'));
		breadcrumbs.visit(scope, crumb('/deals'));

		breadcrumbs.visit(scope, crumb('/companies/42'), true);
		expect(breadcrumbs.crumbsIn(scope).map((c) => c.path)).toEqual(['/companies', '/companies/42']);
	});

	it('starts over when a back navigation lands outside the trail', () => {
		const scope = 'back-out:acme';
		breadcrumbs.startAt('/companies');
		breadcrumbs.visit(scope, crumb('/companies'));
		breadcrumbs.visit(scope, crumb('/companies/42'));

		// Further back than this walk goes: the reader did not step there from
		// the walk, they rewound out of it.
		breadcrumbs.visit(scope, crumb('/'), true);
		expect(breadcrumbs.crumbsIn(scope).map((c) => c.path)).toEqual(['/']);
	});
});
