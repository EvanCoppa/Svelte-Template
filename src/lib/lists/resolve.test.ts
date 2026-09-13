import { describe, expect, it } from 'vitest';
import {
	customFieldKey,
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
		industryRow('beverage', 'assets', 'custom:location', {
			shown: true,
			filterable: true,
			sort_order: 250
		}),
		industryRow('beverage', 'assets', 'custom:serial_number', {
			searchable: true,
			sort_order: 350
		}),
		industryRow('beverage', 'assets', 'purchase_price', { shown: false }),
		industryRow('beverage', 'assets', 'identifier', { label: 'Tag' }),
		industryRow('dentistry', 'assets', 'status', { shown: false })
	]
};

const location: CustomFieldSummary = {
	id: 'd1',
	key: 'location',
	label: 'Location',
	value_type: 'select',
	allowed_values: ['Warehouse', 'Route 1'],
	is_default_shown: false
};
const serial: CustomFieldSummary = {
	id: 'd2',
	key: 'serial_number',
	label: 'Serial number',
	value_type: 'text',
	allowed_values: null,
	is_default_shown: false
};
const calibrated: CustomFieldSummary = {
	id: 'd3',
	key: 'calibrated',
	label: 'Calibrated',
	value_type: 'boolean',
	allowed_values: null,
	is_default_shown: true
};

describe('resolveList', () => {
	it('orders the defaults, names each field from the catalog and keeps its flags', () => {
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

	it('applies the industry’s say column by column and adds its custom fields', () => {
		const spec = resolveList('asset', 'assets', registry, 'beverage', [location, serial]);
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'custom:location',
			'identifier',
			'custom:serial_number',
			'purchase_price',
			'status'
		]);
		// Renamed, everything else inherited.
		expect(spec.fields[2]).toMatchObject({ label: { text: 'Tag' }, searchable: true, shown: true });
		// Hidden, everything else inherited.
		expect(spec.fields[4]).toMatchObject({ key: 'purchase_price', shown: false, type: 'money' });
		// A select field is an enum of its allowed values, plain.
		expect(spec.fields[1]).toEqual({
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
		// An added row's nulls read as a default row would: shown, not filterable.
		expect(spec.fields[3]).toMatchObject({
			type: 'text',
			shown: true,
			searchable: true,
			filterable: false,
			custom: { definitionId: 'd2', valueType: 'text' }
		});
	});

	it('appends the org’s own custom fields no row names, shown only when the definition says so', () => {
		const spec = resolveList('asset', 'assets', registry, 'crm', [serial, calibrated]);
		expect(spec.fields.map((field) => field.key)).toEqual([
			'name',
			'identifier',
			'purchase_price',
			'status',
			'custom:serial_number',
			'custom:calibrated'
		]);
		expect(spec.fields[4]).toMatchObject({
			shown: false,
			searchable: false,
			filterable: false,
			custom: { definitionId: 'd2', valueType: 'text' }
		});
		expect(spec.fields[5]).toMatchObject({
			label: { text: 'Calibrated' },
			type: 'boolean',
			shown: true
		});

		// A row naming the field wins over the flag: beverage lists serial_number as searchable.
		const listed = resolveList('asset', 'assets', registry, 'beverage', [serial]);
		expect(listed.fields.filter((field) => field.key === 'custom:serial_number')).toHaveLength(1);
		expect(listed.fields.find((field) => field.key === 'custom:serial_number')).toMatchObject({
			shown: true,
			searchable: true
		});
	});

	it('drops a custom field the org has not declared, without a word', () => {
		const spec = resolveList('asset', 'assets', registry, 'beverage', [serial]);
		expect(spec.fields.map((field) => field.key)).not.toContain('custom:location');
		expect(spec.fields.map((field) => field.key)).toContain('custom:serial_number');
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

describe('customFieldKey', () => {
	it('reads the key off a custom field and nothing off a catalog key', () => {
		expect(customFieldKey('custom:serial_number')).toBe('serial_number');
		expect(customFieldKey('status')).toBeNull();
	});
});
