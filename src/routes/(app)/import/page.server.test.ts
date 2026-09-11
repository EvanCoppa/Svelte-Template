import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { stringify } from 'devalue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { Feature, FeatureMap, FeatureMode } from '$lib/features/types';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The page from the outside: which kinds it offers, and what its two actions
 * refuse and answer. The matching and the writes are pinned in
 * `$lib/server/imports.test.ts`; this is the wiring around them.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['products', 'read']])
};

function feature(id: string, mode: FeatureMode): [string, { feature: Feature; mode: FeatureMode }] {
	return [
		id,
		{
			mode,
			feature: {
				id,
				name: id,
				noun: null,
				description: null,
				route: `/${id}`,
				icon: null,
				category: 'crm',
				sort_order: 0,
				created_at: '2026-01-01T00:00:00Z'
			}
		}
	];
}

const FEATURES: FeatureMap = Object.fromEntries([
	feature('products', 'enabled'),
	feature('companies', 'disabled'),
	feature('billables', 'enabled')
]);

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the page reads `supabase`, `activeOrgId`, `org.features` and
	// `org.access`; the rest of App.Locals is never touched here.
	return { supabase, activeOrgId: ORG_ID, org: { access, features: FEATURES } } as never;
}

function multipart(fields: Record<string, string | File>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return new Request('https://app.test/import', { method: 'POST', body });
}

/** A commit as the browser posts it — shaped loosely on purpose, so a malformed post can be sent too. */
type CommitPost = {
	kind: string;
	rows: { line: number; decision: string; existingId?: string; values: Record<string, string> }[];
};

/** What `superForm` posts with `dataType: 'json'`: the data devalue-encoded under superforms' own field. */
function json(data: CommitPost) {
	const body = new FormData();
	body.set('__superform_json', stringify(data));
	body.set('__superform_id', 'import-commit');
	return new Request('https://app.test/import', { method: 'POST', body });
}

function csv(text: string): File {
	return new File([text], 'catalog.csv', { type: 'text/csv' });
}

/** The page's data — a load that redirected or returned nothing is a failed test, not a type. */
async function loadData(locals: App.Locals, url: URL) {
	// SAFETY: the load reads `locals` and `url` only.
	const data = await load({ locals, url } as never);
	if (!data) throw new Error('expected page data');
	return data;
}

/** One of the page's actions on a stub event. */
function run(name: 'preview' | 'commit', request: Request, locals: App.Locals) {
	// SAFETY: both actions read `request` and `locals` only; the rest of
	// RequestEvent is irrelevant to them.
	return actions[name]({ request, locals } as never);
}

async function redirectOf<T>(attempt: () => T) {
	try {
		await attempt();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('expected a redirect');
}

describe('load', () => {
	it('offers the kinds the session may import, opening on the one the URL names', async () => {
		const { supabase } = supabaseMock();
		const url = new URL('https://app.test/import?kind=billable');

		const data = await loadData(localsFor(supabase, OWNER), url);
		expect(data.kinds).toEqual(['product', 'billable']);
		expect(data.uploadForm.data.kind).toBe('billable');
		expect(data.commitForm.data.rows).toEqual([]);
	});

	it('offers nothing to a reader, and redirects a signed-out request', async () => {
		const { supabase } = supabaseMock();
		const url = new URL('https://app.test/import');

		const data = await loadData(localsFor(supabase, READER), url);
		expect(data.kinds).toEqual([]);

		const redirect = await redirectOf(() =>
			// SAFETY: a request with no org context.
			load({ locals: { org: null }, url } as never)
		);
		expect(redirect.location).toBe('/login');
	});
});

describe('preview', () => {
	it('answers with the preview beside the form, writing nothing', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [{ id: '20000000-0000-0000-0000-000000000001', name: 'Widget', sku: 'W-1' }]
		});

		const result = await run(
			'preview',
			multipart({ kind: 'product', file: csv('Name,SKU\nWidget,W-1\nGadget,G-1\n') }),
			localsFor(supabase, OWNER)
		);

		expect(result).toHaveProperty('form.valid', true);
		expect(result).toHaveProperty('preview.counts', { new: 1, match: 1, invalid: 0, duplicate: 0 });
		// The file object never rides back to the browser.
		expect(result).not.toHaveProperty('form.data.file');
		expect(from).toHaveBeenCalledWith('products');
		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('fails a bad file with the reader’s message on the form', async () => {
		const { supabase } = supabaseMock({ data: [] });

		const result = await run(
			'preview',
			multipart({ kind: 'product', file: csv('Name,SKU\n') }),
			localsFor(supabase, OWNER)
		);

		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('no rows'));
	});

	it('refuses a kind the user may not write, and one the org has switched off', async () => {
		const { supabase, from } = supabaseMock({ data: [] });

		await expect(
			run(
				'preview',
				multipart({ kind: 'product', file: csv('Name\nWidget\n') }),
				localsFor(supabase, READER)
			)
		).rejects.toMatchObject({ status: 403 });

		await expect(
			run(
				'preview',
				multipart({ kind: 'company', file: csv('Name\nAcme\n') }),
				localsFor(supabase, OWNER)
			)
		).rejects.toMatchObject({ status: 404 });
		expect(from).not.toHaveBeenCalled();
	});
});

describe('commit', () => {
	it('writes the rows as decided and answers with the result', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: 'x' } });

		const result = await run(
			'commit',
			json({
				kind: 'product',
				rows: [
					{ line: 2, decision: 'create', existingId: '', values: { name: 'Widget', sku: 'W-1' } },
					{ line: 3, decision: 'skip', existingId: '', values: { name: 'Gadget' } }
				]
			}),
			localsFor(supabase, OWNER)
		);

		expect(result).toHaveProperty('form.valid', true);
		expect(result).toHaveProperty('result', {
			kind: 'product',
			created: 1,
			updated: 0,
			skipped: 1,
			failures: []
		});
		expect(builder.insert).toHaveBeenCalledTimes(1);
	});

	it('fails a malformed post with the form, writing nothing', async () => {
		const { supabase, from } = supabaseMock({ data: { id: 'x' } });

		const result = await run(
			'commit',
			json({ kind: 'product', rows: [{ line: 0, decision: 'maybe', values: {} }] }),
			localsFor(supabase, OWNER)
		);

		expect(result).toMatchObject({ status: 400 });
		expect(from).not.toHaveBeenCalled();
	});
});
