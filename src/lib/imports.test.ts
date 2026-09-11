import { describe, expect, it } from 'vitest';
import {
	coerceCell,
	fieldFormat,
	mapHeaders,
	missingRequiredFields,
	normalizeHeader,
	templateCsv
} from './imports';
import { importFields, requiredFields } from './schemas/imports';
import type { RecordField } from './schemas/records';

/**
 * The pure half of importing: how a header becomes a field and a cell
 * becomes the string the record form would have posted. The rules here are
 * what the column guide promises, so each one is pinned.
 */

function field(name: string): RecordField {
	const found = importFields('product').find((candidate) => candidate.name === name);
	if (!found) throw new Error(`no product field ${name}`);
	return found;
}

describe('normalizeHeader', () => {
	it('drops case, spacing and punctuation so the obvious spellings are one', () => {
		expect(normalizeHeader('Unit Price')).toBe('unitprice');
		expect(normalizeHeader('unit_price')).toBe('unitprice');
		expect(normalizeHeader(' UNIT-PRICE * ')).toBe('unitprice');
	});
});

describe('mapHeaders', () => {
	it('reads a field by its name, its label or an alias', () => {
		expect(mapHeaders('product', ['name', 'Unit price', 'Part Number'])).toEqual([
			{ header: 'name', field: 'name' },
			{ header: 'Unit price', field: 'unit_price' },
			{ header: 'Part Number', field: 'sku' }
		]);
	});

	it('maps a header nothing answers to as null, and lets the first of two headers keep a field', () => {
		expect(mapHeaders('product', ['Product', 'Colour', 'Item name', ''])).toEqual([
			{ header: 'Product', field: 'name' },
			{ header: 'Colour', field: null },
			{ header: 'Item name', field: null },
			{ header: '', field: null }
		]);
	});

	it("reads each kind's own aliases: a CDT code is a billable's code, a serial an asset's identifier", () => {
		expect(mapHeaders('billable', ['CDT code'])).toEqual([{ header: 'CDT code', field: 'code' }]);
		expect(mapHeaders('asset', ['Serial number'])).toEqual([
			{ header: 'Serial number', field: 'identifier' }
		]);
	});
});

describe('requiredFields', () => {
	it('reads the required fields off the schema: the one every kind needs is its name', () => {
		expect(requiredFields('product')).toEqual(['name']);
		expect(requiredFields('company')).toEqual(['name']);
		expect(requiredFields('contact')).toEqual(['name']);
	});

	it('reports which required fields a mapping misses', () => {
		expect(missingRequiredFields('product', mapHeaders('product', ['SKU', 'Price']))).toEqual([
			'name'
		]);
		expect(missingRequiredFields('product', mapHeaders('product', ['Name']))).toEqual([]);
	});
});

describe('coerceCell', () => {
	it('reads a select by value or label, in any case, and leaves the rest for the schema to refuse', () => {
		expect(coerceCell(field('kind'), 'Service')).toBe('service');
		expect(coerceCell(field('kind'), 'GOOD')).toBe('good');
		expect(coerceCell(field('kind'), 'widget')).toBe('widget');
	});

	it('reads every way a spreadsheet says yes for a yes/no select', () => {
		const featured = importFields('billable').find((candidate) => candidate.name === 'is_featured');
		if (!featured) throw new Error('no is_featured field');
		expect(coerceCell(featured, 'Yes')).toBe('true');
		expect(coerceCell(featured, 'x')).toBe('true');
		expect(coerceCell(featured, 'No')).toBe('false');
		expect(coerceCell(featured, 'Shown on every option')).toBe('true');
	});

	it('strips currency and thousands separators from an amount', () => {
		expect(coerceCell(field('unit_price'), '$1,200.50')).toBe('1200.50');
		expect(coerceCell(field('unit_price'), '€ 45')).toBe('45');
		expect(coerceCell(field('unit_price'), 'ten')).toBe('ten');
	});

	it('reads a US date and a timestamp as the ISO day', () => {
		const acquired = importFields('asset').find((candidate) => candidate.name === 'acquired_on');
		if (!acquired) throw new Error('no acquired_on field');
		expect(coerceCell(acquired, '3/1/2024')).toBe('2024-03-01');
		expect(coerceCell(acquired, '2024-03-01T00:00:00.000Z')).toBe('2024-03-01');
		expect(coerceCell(acquired, '2024-03-01')).toBe('2024-03-01');
	});

	it('trims text and keeps blank blank', () => {
		expect(coerceCell(field('name'), '  Standard installation ')).toBe('Standard installation');
		expect(coerceCell(field('name'), '   ')).toBe('');
	});
});

describe('fieldFormat', () => {
	it('spells out the options of a select and the shape of an amount', () => {
		expect(fieldFormat(field('kind'))).toBe('One of: Good, Service');
		expect(fieldFormat(field('unit_price'))).toBe('An amount like 1200 or 1200.50');
	});
});

describe('templateCsv', () => {
	it('heads the file with the labels the guide shows and follows with one example row', () => {
		const [header, example, rest] = templateCsv('product').split('\r\n');
		expect(header).toBe('Name,Kind,SKU,Unit price,Unit cost,Unit,Description');
		expect(example).toBe('Standard installation,Good,INST-001,499.00,250.00,each,');
		expect(rest).toBe('');
	});

	it('maps back to every field with nothing renamed', () => {
		const [header] = templateCsv('billable').split('\r\n');
		const mapping = mapHeaders('billable', header.split(','));
		expect(mapping.map((entry) => entry.field)).toEqual(
			importFields('billable').map((entry) => entry.name)
		);
	});
});
