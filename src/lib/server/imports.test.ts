import { describe, expect, it } from 'vitest';
import type { Feature, FeatureMap, FeatureMode } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence } from './crm/test-support';
import { commitImport, describePreview, importableKinds } from './imports';
import type { UserAccess } from './roles';
import type { Spreadsheet } from './spreadsheet';

/**
 * The preview's matching rules and the commit's row-by-row writes — the
 * two things a reader trusts when they press "Import": that "Exists" means
 * the record it names, and that one bad row costs one row.
 */

function sheet(headers: string[], ...cells: string[][]): Spreadsheet {
	return {
		sheet: 'Sheet1',
		headers,
		rows: cells.map((row, index) => ({ line: index + 2, cells: row }))
	};
}

const CROWN = {
	id: '20000000-0000-0000-0000-000000000001',
	name: 'Porcelain crown',
	values: { name: 'Porcelain crown', code: 'D2740', unit_price: '1450', unit: 'tooth' }
};

const CLEANING = {
	id: '20000000-0000-0000-0000-000000000002',
	name: 'Cleaning',
	values: { name: 'Cleaning', code: '', unit_price: '120', unit: '' }
};

describe('describePreview', () => {
	it('reads the headers as fields, coerces the cells and validates each row as the form would', () => {
		const preview = describePreview(
			'billable',
			'fees.csv',
			sheet(['Procedure', 'CDT code', 'Fee', 'Colour'], ['Filling', 'D2391', '$210.00', 'white']),
			[]
		);

		expect(preview.mapping).toEqual([
			{ header: 'Procedure', field: 'name' },
			{ header: 'CDT code', field: 'code' },
			{ header: 'Fee', field: 'unit_price' },
			{ header: 'Colour', field: null }
		]);
		expect(preview.missingRequired).toEqual([]);
		expect(preview.rows).toEqual([
			{
				line: 2,
				status: 'new',
				errors: [],
				// Every typed field is present, blank where the file lacks it; a
				// blank select is left out so its default stands.
				values: {
					name: 'Filling',
					code: 'D2391',
					unit_price: '210.00',
					unit: '',
					unit_choices: '',
					description: ''
				}
			}
		]);
		expect(preview.counts).toEqual({ new: 1, match: 0, invalid: 0, duplicate: 0 });
	});

	it('marks a row invalid with the schema’s own message, and never matches it', () => {
		const preview = describePreview(
			'billable',
			'fees.csv',
			sheet(['Name', 'Code', 'Price'], ['', 'D2740', 'ten'], ['Crown', 'D2740', 'ten']),
			[CROWN]
		);

		expect(preview.rows[0].status).toBe('invalid');
		expect(preview.rows[0].errors).toEqual(
			expect.arrayContaining([
				{ field: 'name', message: 'Name is required.' },
				{ field: 'unit_price', message: 'Enter an amount like 1200 or 1200.50' }
			])
		);
		expect(preview.rows[1]).toMatchObject({ status: 'invalid' });
		expect(preview.rows[1].match).toBeUndefined();
	});

	it('reports the required fields no header maps to, and words the rows the same way', () => {
		const preview = describePreview('product', 'x.csv', sheet(['SKU'], ['W-1']), []);

		expect(preview.missingRequired).toEqual(['name']);
		expect(preview.rows[0].status).toBe('invalid');
		expect(preview.rows[0].errors).toEqual([{ field: 'name', message: 'Name is required.' }]);
	});

	it('words a select that took free text in the column guide’s terms', () => {
		const preview = describePreview(
			'product',
			'x.csv',
			sheet(['Name', 'Kind'], ['Widget', 'Doohickey']),
			[]
		);

		expect(preview.rows[0].errors).toEqual([
			{ field: 'kind', message: 'Kind must be one of: Good, Service.' }
		]);
	});

	it('matches a row by its key, in any case, and lists what the file would change', () => {
		const preview = describePreview(
			'billable',
			'fees.csv',
			sheet(['Name', 'Code', 'Price', 'Unit'], ['Porcelain Crown', 'd2740', '1450.00', 'crown']),
			[CROWN]
		);

		expect(preview.rows[0].status).toBe('match');
		expect(preview.rows[0].match).toEqual({
			id: CROWN.id,
			name: 'Porcelain crown',
			by: 'code',
			// The code matched, so its spelling is not a change; the name and the unit are.
			changes: [
				{ field: 'name', label: 'Name', from: 'Porcelain crown', to: 'Porcelain Crown' },
				{ field: 'unit', label: 'Unit', from: 'tooth', to: 'crown' }
			]
		});
	});

	it('falls back to the name only when the row or the record has no key', () => {
		const rows = sheet(
			['Name', 'Code'],
			['cleaning', ''],
			['Cleaning', 'D1110'],
			['Porcelain crown', 'D9999']
		);
		const preview = describePreview('billable', 'fees.csv', rows, [CROWN, CLEANING]);

		// No key in the file: the name says which record.
		expect(preview.rows[0]).toMatchObject({ status: 'match', match: { by: 'name' } });
		// A key in the file, none on the record: still the record of that name.
		expect(preview.rows[1]).toMatchObject({ status: 'match', match: { id: CLEANING.id } });
		// Keys on both sides that differ: a new record, whatever the name says.
		expect(preview.rows[2].status).toBe('new');
	});

	it('flags a second row for the same record inside the file as a duplicate of the first', () => {
		const preview = describePreview(
			'product',
			'catalog.csv',
			sheet(
				['Name', 'SKU'],
				['Widget', 'W-1'],
				['Widget (blue)', 'w-1'],
				['Gadget', ''],
				['gadget', '']
			),
			[]
		);

		expect(preview.rows.map((row) => row.status)).toEqual(['new', 'duplicate', 'new', 'duplicate']);
		expect(preview.rows[1].duplicateOf).toBe(2);
		expect(preview.rows[3].duplicateOf).toBe(4);
		expect(preview.counts).toEqual({ new: 2, match: 0, invalid: 0, duplicate: 2 });
	});

	it('does not count a blank cell as a change, and reads equal amounts as equal', () => {
		const preview = describePreview(
			'billable',
			'fees.csv',
			sheet(['Name', 'Code', 'Price', 'Unit'], ['Porcelain crown', 'D2740', '1450.00', '']),
			[CROWN]
		);

		expect(preview.rows[0].match?.changes).toEqual([]);
	});
});

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

describe('importableKinds', () => {
	const features: FeatureMap = Object.fromEntries([
		feature('products', 'enabled'),
		feature('billables', 'locked_visible'),
		feature('companies', 'enabled')
	]);

	it('lists a kind only when its feature is enabled and the user may manage it', () => {
		const owner: UserAccess = { role: 'owner', roles: [], grants: new Map() };
		expect(importableKinds(features, owner)).toEqual(['company', 'product']);

		const clerk: UserAccess = {
			role: 'member',
			roles: [],
			grants: new Map([
				['products', 'manage'],
				['companies', 'read']
			])
		};
		expect(importableKinds(features, clerk)).toEqual(['product']);
	});
});

describe('commitImport', () => {
	const EXISTING = '20000000-0000-0000-0000-000000000009';

	it('creates, overwrites and skips as each row says, writing only the columns the file provided', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: { id: 'x' } }]);

		const result = await commitImport(supabase, ORG_ID, 'product', [
			{ line: 2, decision: 'create', existingId: '', values: { name: 'Widget', sku: 'W-1' } },
			{
				line: 3,
				decision: 'update',
				existingId: EXISTING,
				values: { name: 'Gadget', sku: 'G-1', unit_price: '12', unit: '' }
			},
			{ line: 4, decision: 'skip', existingId: '', values: { name: 'Doodad' } }
		]);

		expect(result).toEqual({ kind: 'product', created: 1, updated: 1, skipped: 1, failures: [] });
		expect(from).toHaveBeenCalledTimes(2);
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Widget', sku: 'W-1', org_id: ORG_ID })
		);
		// The blank unit and the columns the file never had are not written.
		expect(builder.update).toHaveBeenCalledWith({ name: 'Gadget', sku: 'G-1', unit_price: 12 });
		expect(builder.eq).toHaveBeenCalledWith('id', EXISTING);
	});

	it('fails one row for a value the schema refuses, an overwrite with nothing to overwrite, or a refused write', async () => {
		const { supabase } = supabaseMockSequence([
			{
				error: {
					message: 'duplicate key value violates unique constraint "products_org_id_sku_idx"'
				}
			}
		]);

		const result = await commitImport(supabase, ORG_ID, 'product', [
			{ line: 2, decision: 'create', existingId: '', values: { name: '' } },
			{ line: 3, decision: 'update', existingId: '', values: { name: 'Gadget' } },
			{ line: 4, decision: 'create', existingId: '', values: { name: 'Widget', sku: 'W-1' } }
		]);

		expect(result).toMatchObject({ created: 0, updated: 0, skipped: 0 });
		expect(result.failures).toEqual([
			{ line: 2, message: 'Name is required.' },
			{ line: 3, message: 'There is no existing record to overwrite.' },
			{ line: 4, message: expect.stringContaining('duplicate key') }
		]);
	});
});
