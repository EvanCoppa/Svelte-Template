import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import {
	ASSET_STATUS_TONE,
	COMPANY_RELATIONSHIP_TONE,
	INVOICE_STATUS_TONE,
	PARTY_STATUS_TONE,
	PAYMENT_STATE_TONE,
	PRIORITY_TONE,
	PRODUCT_KIND_TONE,
	PROPOSAL_STATUS_TONE,
	TICKET_STATUS_TONE
} from '$lib/crm/tones';
import { capitalize } from '$lib/utils.js';
import type { FieldLabel, FieldType, FilterOption, ListKind } from './types';

/**
 * The built-in fields of every kind that has a list — what a `list_fields`
 * row may name, and what each key renders as. The describer
 * (`$lib/server/crm/lists`) fills a cell for every key here, and the
 * resolver refuses a row naming a key that is not here, so a list can never
 * ask for a column nothing can draw.
 *
 * `name` is every kind's first field and the link into the record; the
 * resolver puts it first whatever the rows say. A label is either fixed text
 * or the name of a kind of record, which the page words through the terms
 * the layout shipped — "Company" to a roofer, never a constant here. Enum
 * fields carry their options, toned from the shared maps, so a filter lists
 * every value even when the rows on screen hold only some of them; an
 * org-defined set (a stage, a category) has no options here and the filter
 * offers whatever the rows hold.
 */

export type FieldMeta = {
	label: FieldLabel;
	type: FieldType;
	options?: readonly FilterOption[];
};

/** The options of an enum drawn as a pill: its values, in the tone map's order. */
function enumOptions(tones: Record<string, BadgeTone>): FilterOption[] {
	return Object.entries(tones).map(([value, tone]) => ({
		value,
		label: capitalize(value),
		tone
	}));
}

const text = (label: string): FieldMeta => ({ label: { text: label }, type: 'text' });
const money = (label: string): FieldMeta => ({ label: { text: label }, type: 'money' });
const date = (label: string): FieldMeta => ({ label: { text: label }, type: 'date' });
const datetime = (label: string): FieldMeta => ({ label: { text: label }, type: 'datetime' });
const enumOf = (label: string, tones: Record<string, BadgeTone>): FieldMeta => ({
	label: { text: label },
	type: 'enum',
	options: enumOptions(tones)
});
/** A field naming another kind of record, labelled by that kind's word. */
const record = (kind: 'company' | 'contact'): FieldMeta => ({ label: { kind }, type: 'record' });

/** A yes/no field's two values, as `cellText()` reads them. */
export const BOOLEAN_OPTIONS: readonly FilterOption[] = [
	{ value: 'Yes', label: 'Yes' },
	{ value: 'No', label: 'No' }
];
const boolean = (label: string): FieldMeta => ({
	label: { text: label },
	type: 'boolean',
	options: BOOLEAN_OPTIONS
});

const created = datetime('Added');

/** Every value an invoice's money state can read as, "overdue" included (see `ListCell`). */
export const PAYMENT_OPTIONS: readonly FilterOption[] = [
	...enumOptions(PAYMENT_STATE_TONE),
	{ value: 'overdue', label: 'Overdue', tone: 'error' }
];

/** A billable's on/off switch, read as a status so it filters like one. */
export const BILLABLE_STATUS_TONE = {
	active: 'success',
	inactive: 'neutral'
} as const satisfies Record<string, BadgeTone>;

export const LIST_FIELD_CATALOG = {
	company: {
		name: text('Name'),
		relationship: enumOf('Relationship', COMPANY_RELATIONSHIP_TONE),
		status: enumOf('Status', PARTY_STATUS_TONE),
		email: text('Email'),
		phone: text('Phone'),
		website: text('Website'),
		city: text('City'),
		created_at: created
	},
	contact: {
		name: text('Name'),
		company: record('company'),
		title: text('Title'),
		email: text('Email'),
		phone: text('Phone'),
		status: enumOf('Status', PARTY_STATUS_TONE),
		city: text('City'),
		created_at: created
	},
	asset: {
		name: text('Name'),
		asset_type: text('Type'),
		identifier: text('Identifier'),
		status: enumOf('Status', ASSET_STATUS_TONE),
		acquired_on: date('Acquired'),
		disposed_on: date('Disposed'),
		purchase_price: money('Purchase price'),
		created_at: created
	},
	product: {
		name: text('Name'),
		kind: enumOf('Kind', PRODUCT_KIND_TONE),
		category: text('Category'),
		sku: text('SKU'),
		unit_price: money('Price'),
		quantity_on_hand: { label: { text: 'On hand' }, type: 'number' },
		created_at: created
	},
	deal: {
		name: text('Name'),
		company: record('company'),
		contact: record('contact'),
		/** Stages are an org's rows, toned by outcome; the filter offers the names on screen. */
		stage: { label: { text: 'Stage' }, type: 'enum' },
		amount: money('Amount'),
		expected_close_date: date('Expected close'),
		created_at: created
	},
	ticket: {
		number: { label: { text: '#' }, type: 'number' },
		name: text('Subject'),
		company: record('company'),
		contact: record('contact'),
		status: enumOf('Status', TICKET_STATUS_TONE),
		priority: enumOf('Priority', PRIORITY_TONE),
		created_at: created
	},
	invoice: {
		name: text('Number'),
		company: record('company'),
		contact: record('contact'),
		status: enumOf('Status', INVOICE_STATUS_TONE),
		payment: { label: { text: 'Payment' }, type: 'payment', options: PAYMENT_OPTIONS },
		total: money('Total'),
		balance: money('Balance due'),
		due_date: date('Due'),
		created_at: created
	},
	proposal: {
		name: text('Title'),
		status: enumOf('Status', PROPOSAL_STATUS_TONE),
		options: { label: { text: 'Options' }, type: 'number' },
		recommended: money('Recommended'),
		valid_until: datetime('Valid until'),
		created_at: datetime('Created')
	},
	billable: {
		name: text('Name'),
		code: text('Code'),
		unit_price: money('Unit price'),
		unit_choices: text('Units'),
		is_featured: boolean('Featured'),
		status: enumOf('Status', BILLABLE_STATUS_TONE),
		created_at: created
	}
} as const satisfies Record<ListKind, { name: FieldMeta } & Record<string, FieldMeta>>;

/** The keys a kind's rows may name — one per column the describer can fill. */
export type CatalogKey<K extends ListKind> = keyof (typeof LIST_FIELD_CATALOG)[K] & string;

export function catalogField(kind: ListKind, key: string): FieldMeta | null {
	const catalog: Record<string, FieldMeta> = LIST_FIELD_CATALOG[kind];
	return Object.hasOwn(catalog, key) ? (catalog[key] ?? null) : null;
}

/** Whether `key` is one of the kind's catalog keys — the narrowing the describer switches on. */
export function isCatalogKey<K extends ListKind>(kind: K, key: string): key is CatalogKey<K> {
	return catalogField(kind, key) !== null;
}
