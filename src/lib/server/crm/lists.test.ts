import { describe, expect, it } from 'vitest';
import type { ListSpec } from '$lib/lists/types';
import type { Address } from './addresses';
import type { Asset } from './assets';
import type { Company } from './companies';
import type { CustomFieldValue } from './custom-fields';
import type { InvoiceWithParties } from './invoices';
import { describeListRows, listNeeds, listRecords, resultIds } from './lists';
import { ORG_ID, supabaseTablesMock } from './test-support';

const STEEL = '20000000-0000-0000-0000-000000000003';
const TAP = 'f1000000-0000-0000-0013-000000000001';
const STAMPS = {
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z',
	created_by: null
};

const steel: Company = {
	id: STEEL,
	org_id: ORG_ID,
	name: 'Gotham Steel Supply',
	relationship: 'supplier',
	status: 'active',
	email: null,
	phone: ' +1 555 0180 ',
	website: null,
	vendor_account_number: null,
	payment_terms_days: null,
	distribution_fee_pct: null,
	...STAMPS
};

const tap: Asset = {
	id: TAP,
	org_id: ORG_ID,
	name: 'Draft tower, 4-tap',
	asset_type: 'tap',
	identifier: 'TAP-0041',
	status: 'active',
	description: null,
	acquired_on: '2025-03-10',
	disposed_on: null,
	purchase_price: 1850,
	currency: 'USD',
	...STAMPS
};

const field = (
	key: string,
	type: ListSpec['fields'][number]['type'],
	overrides: Partial<ListSpec['fields'][number]> = {}
): ListSpec['fields'][number] => ({
	key,
	label: { text: key },
	type,
	shown: true,
	searchable: false,
	filterable: false,
	options: null,
	custom: null,
	...overrides
});

const address: Address = {
	id: 'a1',
	org_id: ORG_ID,
	entity_type: 'company',
	entity_id: STEEL,
	kind: 'primary',
	label: null,
	line1: '1 Dock Rd',
	line2: null,
	city: 'Jersey City',
	region: 'NJ',
	postal_code: null,
	country: 'US',
	latitude: 40.7178,
	longitude: -74.0431,
	is_primary: true,
	created_at: '',
	updated_at: ''
};

describe('listRecords', () => {
	it('reads the kind through its own module, scoped to the org', async () => {
		const { supabase, from, builders } = supabaseTablesMock({ assets: { data: [tap] } });
		const result = await listRecords(supabase, ORG_ID, 'asset');
		expect(result).toEqual({ kind: 'asset', rows: [tap] });
		expect(from).toHaveBeenCalledWith('assets');
		expect(builders.assets?.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(resultIds(result)).toEqual([TAP]);
	});
});

describe('listNeeds', () => {
	it('asks for addresses only for a city column, custom values only for a custom field, and assignees only for a person field', () => {
		expect(listNeeds({ kind: 'company', fields: [field('name', 'text')] })).toEqual({
			addresses: false,
			customValues: false,
			assignees: false
		});
		expect(
			listNeeds({
				kind: 'company',
				fields: [
					field('city', 'text'),
					field('custom:mid', 'text', { custom: { definitionId: 'd', valueType: 'text' } }),
					field('assigned_to', 'person')
				]
			})
		).toEqual({ addresses: true, customValues: true, assignees: true });
	});
});

describe('describeListRows', () => {
	it('describes each row in the spec’s field order, typed by how it renders', () => {
		const spec: ListSpec = {
			kind: 'company',
			fields: [
				field('name', 'text'),
				field('relationship', 'enum'),
				field('phone', 'text'),
				field('city', 'text'),
				field('assigned_to', 'person'),
				field('created_at', 'datetime')
			]
		};
		const rows = describeListRows({ kind: 'company', rows: [steel] }, spec, () => true, {
			addresses: [address],
			customValues: [],
			assignees: new Map([[STEEL, { userId: 'u1', name: 'Ada Lovelace' }]])
		});
		expect(rows).toEqual([
			{
				id: STEEL,
				cells: [
					{ type: 'link', text: 'Gotham Steel Supply', href: `/companies/${STEEL}` },
					{ type: 'status', text: 'supplier', tone: 'cyan' },
					{ type: 'text', text: '+1 555 0180' },
					{ type: 'text', text: 'Jersey City' },
					{ type: 'person', userId: 'u1', name: 'Ada Lovelace' },
					{ type: 'datetime', value: '2026-01-01T00:00:00Z' }
				]
			}
		]);
	});

	it('reads a company with no open assignment as an empty person cell', () => {
		const spec: ListSpec = {
			kind: 'company',
			fields: [field('name', 'text'), field('assigned_to', 'person')]
		};
		const [row] = describeListRows({ kind: 'company', rows: [steel] }, spec, () => true, {
			addresses: [],
			customValues: [],
			assignees: new Map()
		});
		expect(row?.cells).toEqual([
			{ type: 'link', text: 'Gotham Steel Supply', href: `/companies/${STEEL}` },
			{ type: 'person', userId: null, name: null }
		]);
	});

	it('fills a custom field from the record’s value in the definition’s column, blank when none', () => {
		const location: CustomFieldValue = {
			id: 'v1',
			org_id: ORG_ID,
			entity_type: 'asset',
			entity_id: TAP,
			field_definition_id: 'd1',
			value_text: 'Route 1',
			value_numeric: null,
			value_boolean: null,
			created_at: '',
			updated_at: ''
		};
		const spec: ListSpec = {
			kind: 'asset',
			fields: [
				field('name', 'text'),
				field('custom:location', 'enum', { custom: { definitionId: 'd1', valueType: 'select' } }),
				field('custom:serial_number', 'text', {
					custom: { definitionId: 'd2', valueType: 'text' }
				}),
				field('custom:calibrated', 'boolean', {
					custom: { definitionId: 'd3', valueType: 'boolean' }
				}),
				field('purchase_price', 'money')
			]
		};
		const [row] = describeListRows({ kind: 'asset', rows: [tap] }, spec, () => false, {
			addresses: [],
			customValues: [location],
			assignees: new Map()
		});
		expect(row?.cells).toEqual([
			{ type: 'link', text: 'Draft tower, 4-tap', href: null },
			{ type: 'text', text: 'Route 1' },
			{ type: 'text', text: '' },
			{ type: 'boolean', value: null },
			{ type: 'money', value: 1850, currency: 'USD', unit: null }
		]);
	});

	it('links a party only when the reader may open its kind, and hands the browser the money state', () => {
		const invoice: InvoiceWithParties = {
			id: 'i1',
			org_id: ORG_ID,
			number: 'INV-0001',
			company_id: STEEL,
			contact_id: null,
			order_id: null,
			status: 'issued',
			payment_status: 'partial',
			currency: 'USD',
			issued_at: '2026-08-01T00:00:00Z',
			due_date: '2026-08-31',
			payment_terms_days: 30,
			paid_at: null,
			billing_email: null,
			memo: null,
			notes: null,
			subtotal: 100,
			discount: 0,
			shipping: 0,
			tax: 0,
			total: 100,
			amount_paid: 40,
			balance_due: 60,
			voided_at: null,
			companies: { id: STEEL, name: 'Gotham Steel Supply' },
			contacts: null,
			...STAMPS
		};
		const spec: ListSpec = {
			kind: 'invoice',
			fields: [
				field('name', 'text'),
				field('company', 'record'),
				field('contact', 'record'),
				field('payment', 'payment'),
				field('balance', 'money')
			]
		};
		const [row] = describeListRows(
			{ kind: 'invoice', rows: [invoice] },
			spec,
			(kind) => kind === 'invoice',
			{ addresses: [], customValues: [], assignees: new Map() }
		);
		expect(row?.cells).toEqual([
			{ type: 'link', text: 'INV-0001', href: '/invoices/i1' },
			{ type: 'record', text: 'Gotham Steel Supply', href: null },
			{ type: 'record', text: '', href: null },
			{ type: 'payment', state: 'partial', dueDate: '2026-08-31', owed: true },
			{ type: 'money', value: 60, currency: 'USD', unit: null }
		]);
	});

	it('returns nothing for a spec of another kind — the pairing is total, never a cast', () => {
		expect(
			describeListRows(
				{ kind: 'asset', rows: [tap] },
				{ kind: 'company', fields: [field('name', 'text')] },
				() => true,
				{ addresses: [], customValues: [], assignees: new Map() }
			)
		).toEqual([]);
	});
});
