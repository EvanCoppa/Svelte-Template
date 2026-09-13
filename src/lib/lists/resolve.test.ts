import { describe, expect, it } from 'vitest';
import {
	customFieldColumnId,
	resolveList,
	type CustomFieldSummary,
	type IndustryListFieldRow,
	type ListFieldRow,
	type ListRegistry
} from './resolve';

const row = (
	feature_id: string,
	field: string,
	sort_order: number,
	flags: Partial<Pick<ListFieldRow, 'shown' | 'searchable' | 'filterable' | 'label'>> = {}
): ListFieldRow => ({
	feature_id,
	field,
	sort_order,
	label: null,
	shown: true,
	searchable: false,
	filterable: false,
	...flags
});

const industryRow = (
	industry_id: string,
	feature_id: string,
	field: string,
	overrides: Partial<
		Pick<IndustryListFieldRow, 'label' | 'shown' | 'searchable' | 'filterable' | 'sort_order'>
	> = {}
): IndustryListFieldRow => ({
	industry_id,
	feature_id,
	field,
	label: null,
	shown: null,
	searchable: null,
	filterable: null,
	sort_order: null,
	...overrides
});

const registry: ListRegistry = {
	defaults: [
		row('assets', 'status', 600, { filterable: true }),
		row('assets', 'name', 100, { searchable: true }),
		row('assets', 'purchase_price', 500),
		row('assets', 'identifier', 300, { searchable: true }),
		row('companies', 'name', 100, { searchable: true })
	],
	industries: [
		industryRow('beverage', 'assets', 'purchase_price', { shown: false }),
		industryRow('beverage', 'assets', 'identifier', { label: 'Tag' }),
		industryRow('beverage', 'assets', 'disposed_on', { sort_order: 650 }),
		industryRow('dentistry', 'assets', 'status', { shown: false })
	]
};

const definition = (
	overrides: Partial<CustomFieldSummary> & Pick<CustomFieldSummary, 'id' | 'key' | 'label'>
): CustomFieldSummary => ({
	value_type: 'text',
	allowed_values: null,
	list_shown: false,
	list_searchable: false,
	list_filterable: false,
	...overrides
});

const location = definition({
	id: 'd1',
	key: 'location',
	label: 'Location',
	value_type: 'select',
	allowed_values: ['Warehouse', 'Route 1'],
	list_shown: true,
	list_filterable: true
});
const serial = definition({
	id: 'd2',
	key: 'serial_number',
	label: 'Serial number',
	list_shown: true,
	list_searchable: true
});
const hours = definition({
	id: 'd3',
	key: 'hours',
	label: 'Hours',
	value_type: 'numeric',
	// Not filterable: the database refuses it, and the resolver reads it as false regardless.
	list_filterable: true
});

describe('resolveList', () => {
	it('orders the built-in defaults, names each from the catalog and keeps its flags', () => {
		const spec = resolveList('asset', 'assets', registry, 'crm', []);
		expect(spec.kind).toBe('asset');
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'identifier',
			'purchase_price',
			'status'
		]);
		expect(spec.fields[0]).toMatchObject({
			label: { text: 'Name' },
			type: 'text',
			shown: true,
			searchable: true,
			custom: null
		});
		expect(spec.fields[3]).toMatchObject({
			type: 'enum',
			filterable: true,
			options: expect.arrayContaining([{ value: 'active', label: 'Active', tone: 'success' }])
		});
	});

	it('applies the industry’s say on built-in columns, column by column', () => {
		const spec = resolveList('asset', 'assets', registry, 'beverage', []);
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'identifier',
			'purchase_price',
			'status',
			'disposed_on'
		]);
		// Renamed, everything else inherited.
		expect(spec.fields[1]).toMatchObject({ label: { text: 'Tag' }, searchable: true, shown: true });
		// Hidden, everything else inherited.
		expect(spec.fields[2]).toMatchObject({ key: 'purchase_price', shown: false, type: 'money' });
		// Added by the industry: shown, the rest as a default row would be.
		expect(spec.fields[4]).toMatchObject({ shown: true, searchable: false, filterable: false });
	});

	it('appends every custom field after the built-ins, each as its own flags say', () => {
		const spec = resolveList('asset', 'assets', registry, 'crm', [hours, location, serial]);
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'identifier',
			'purchase_price',
			'status',
			'custom:hours',
			'custom:location',
			'custom:serial_number'
		]);
		// A select field is an enum of its allowed values, plain.
		expect(spec.fields[5]).toEqual({
			key: 'custom:location',
			label: { text: 'Location' },
			type: 'enum',
			options: [
				{ value: 'Warehouse', label: 'Warehouse' },
				{ value: 'Route 1', label: 'Route 1' }
			],
			shown: true,
			searchable: false,
			filterable: true,
			custom: { definitionId: 'd1', valueType: 'select' }
		});
		expect(spec.fields[6]).toMatchObject({
			type: 'text',
			shown: true,
			searchable: true,
			filterable: false,
			custom: { definitionId: 'd2', valueType: 'text' }
		});
		// A numeric field has no values to pick from, so it is never a filter.
		expect(spec.fields[4]).toMatchObject({ type: 'number', shown: false, filterable: false });
	});

	it('leads with the name column even when the rows forgot it or hid it', () => {
		const spec = resolveList(
			'asset',
			'assets',
			{
				defaults: [row('assets', 'status', 100), row('assets', 'name', 200, { shown: false })],
				industries: []
			},
			'crm',
			[]
		);
		expect(spec.fields.map((field) => field.key)).toEqual(['name', 'status']);
		expect(spec.fields[0]?.shown).toBe(true);

		const synthesized = resolveList(
			'asset',
			'assets',
			{ defaults: [row('assets', 'status', 100)], industries: [] },
			'crm',
			[]
		);
		expect(synthesized.fields[0]).toMatchObject({ key: 'name', shown: true, searchable: true });
	});

	it('ignores other lists’ rows and other industries’ rows', () => {
		const spec = resolveList('asset', 'assets', registry, 'roofing', []);
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'identifier',
			'purchase_price',
			'status'
		]);
		expect(spec.fields.every((field) => field.shown)).toBe(true);
	});

	it('names the list when a row is wrong', () => {
		expect(() =>
			resolveList(
				'asset',
				'assets',
				{ defaults: [row('assets', 'sku', 100)], industries: [] },
				'crm',
				[]
			)
		).toThrow('List assets shows a field asset does not have: sku');
		expect(() =>
			resolveList(
				'asset',
				'assets',
				{ defaults: [row('assets', 'purchase_price', 100, { filterable: true })], industries: [] },
				'crm',
				[]
			)
		).toThrow('a money field cannot be filtered');
	});
});

describe('customFieldColumnId', () => {
	it('keeps a custom field’s column apart from a built-in of the same key', () => {
		expect(customFieldColumnId('status')).toBe('custom:status');
	});
});
