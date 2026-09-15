import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import {
	ASSET_STATUS_TONE,
	COMPANY_RELATIONSHIP_TONE,
	COUPON_DISCOUNT_TYPE_TONE,
	INVOICE_STATUS_TONE,
	PARTY_STATUS_TONE,
	PAYMENT_STATE_TONE,
	PRIORITY_TONE,
	PRODUCT_KIND_TONE,
	PROPERTY_STATUS_TONE,
	PROPOSAL_STATUS_TONE,
	FULFILLMENT_STATE_TONE,
	ORDER_STATUS_TONE,
	PURCHASE_STATUS_TONE,
	SHIPMENT_DELIVERY_TONE,
	RMA_STATUS_TONE,
	TICKET_STATUS_TONE,
	VISIT_STATUS_TONE
} from '$lib/crm/tones';
import type { TermId } from '$lib/features/vocabulary';
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
const record = (kind: 'company' | 'contact' | 'property'): FieldMeta => ({
	label: { kind },
	type: 'record'
});
/** A field naming another record under a label of its own — a role, not a kind. */
const namedRecord = (label: string): FieldMeta => ({ label: { text: label }, type: 'record' });
const number = (label: string): FieldMeta => ({ label: { text: label }, type: 'number' });
/**
 * The record's picture, as a thumbnail beside its name. A column like any
 * other — an industry that does not sell things people look at hides it with
 * one `industry_list_fields` row — but never searched, filtered or sorted:
 * there is no value in it to compare.
 */
const image = (label: string): FieldMeta => ({ label: { text: label }, type: 'image' });
/** A member's name, labelled by a word that belongs to no feature (a proposal's presenter). */
const person = (id: TermId): FieldMeta => ({ label: { term: id }, type: 'text' });

/**
 * Whether a tenancy runs to a date or rolls on. A STORED fact (`ends_on` null
 * or not), and deliberately not "is it running today" — that is a question
 * about the viewer's date, and a server-described cell would be wrong at
 * midnight. `leaseStateOn()` is that question, in the browser.
 */
export const LEASE_TERM_TONE = {
	'fixed term': 'neutral',
	'month-to-month': 'info'
} as const satisfies Record<string, BadgeTone>;

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

/**
 * An on/off switch read as a status so it filters like one — a billable's
 * `is_active`, a coupon's. Not an enum in the database, which is why it is
 * here beside the catalog rather than in `$lib/crm/tones`.
 */
export const ACTIVE_STATUS_TONE = {
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
	property: {
		name: text('Name'),
		// The building this row is a unit of. Labelled for the ROLE, not the
		// kind: "Property" would name the record itself, and what the column
		// shows is its parent.
		parent: namedRecord('Part of'),
		property_type: text('Type'),
		identifier: text('Identifier'),
		status: enumOf('Status', PROPERTY_STATUS_TONE),
		bedrooms: number('Beds'),
		bathrooms: number('Baths'),
		square_feet: number('Sq ft'),
		market_rent: money('Market rent'),
		acquired_on: date('Acquired'),
		purchase_price: money('Purchase price'),
		created_at: created
	},
	lease: {
		name: text('Lease'),
		property: record('property'),
		// A contact or a company — the party model — so the label is the role.
		tenant: namedRecord('Tenant'),
		term: enumOf('Term', LEASE_TERM_TONE),
		starts_on: date('Starts'),
		ends_on: date('Ends'),
		rent_amount: money('Rent'),
		rent_due_day: number('Due on'),
		security_deposit: money('Deposit'),
		created_at: created
	},
	product: {
		name: text('Name'),
		image: image('Image'),
		kind: enumOf('Kind', PRODUCT_KIND_TONE),
		category: text('Category'),
		sku: text('SKU'),
		unit_price: money('Price'),
		quantity_on_hand: number('On hand'),
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
		number: number('#'),
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
		// The record it hangs off — a company, a contact, or a deal — whichever
		// it is (docs/proposals.md, "the record it hangs off"); an unattached
		// draft reads blank.
		contact: namedRecord('Contact'),
		owner: person('proposal_responsible'),
		presenter: person('proposal_presenter'),
		status: enumOf('Status', PROPOSAL_STATUS_TONE),
		// What a client actually chose; blank until `selected_option_id` is set.
		value: money('Value'),
		created_at: datetime('Created')
	},
	billable: {
		name: text('Name'),
		code: text('Code'),
		unit_price: money('Unit price'),
		unit_choices: text('Units'),
		is_featured: boolean('Featured'),
		status: enumOf('Status', ACTIVE_STATUS_TONE),
		created_at: created
	},
	coupon: {
		name: text('Code'),
		discount_type: enumOf('Type', COUPON_DISCOUNT_TYPE_TONE),
		/**
		 * What the coupon takes off, already read against its type — "20%" or
		 * "$15.00". Text rather than money or a number because the two types
		 * print in different units, and a cell is typed by how it renders.
		 */
		discount: text('Discount'),
		starts_on: date('Starts'),
		ends_on: date('Ends'),
		status: enumOf('Status', ACTIVE_STATUS_TONE),
		description: text('Description'),
		created_at: created
	},
	order: {
		name: text('Number'),
		// Both sides of the party model: an order names the company, and the
		// person at it who asked when there is one.
		company: record('company'),
		contact: record('contact'),
		// The two axes a fulfillment queue reads together — what a person
		// committed to, and what the lines have folded into.
		status: enumOf('Status', ORDER_STATUS_TONE),
		fulfillment_status: enumOf('Fulfillment', FULFILLMENT_STATE_TONE),
		customer_po: text('Customer PO'),
		total: money('Total'),
		estimated_ship_date: date('Est. ship'),
		confirmed_at: datetime('Confirmed'),
		created_at: created
	},
	shipment: {
		// A shipment has no name of its own — the tracking number is what a
		// row is known by, so the catalog's `name` key is that.
		name: text('Tracking number'),
		order: namedRecord('Order'),
		delivery_status: enumOf('Status', SHIPMENT_DELIVERY_TONE),
		carrier: text('Carrier'),
		// Who shipped it, when it was not the org itself.
		supplier: record('company'),
		ship_date: date('Shipped'),
		estimated_delivery_date: date('Due'),
		delivered_at: datetime('Delivered'),
		created_at: created
	},
	purchase: {
		name: text('Number'),
		// The vendor. A purchase names a company and never a person: you buy
		// from an organisation, and the table's column is not nullable.
		company: record('company'),
		status: enumOf('Status', PURCHASE_STATUS_TONE),
		reference: text('Reference'),
		total: money('Total'),
		expected_at: datetime('Expected'),
		ordered_at: datetime('Ordered'),
		created_at: created
	},
	visit: {
		/**
		 * Who was visited — a visit has no name of its own, so this is the
		 * subject's name, and like every list's first field it links to the
		 * record the row IS. Text rather than `record`, because the cell opens
		 * the visit and not the company.
		 */
		name: text('Visited'),
		status: enumOf('Status', VISIT_STATUS_TONE),
		/** An org's own rows, toned per row; the filter offers the names on screen. */
		outcome: { label: { text: 'Outcome' }, type: 'enum' },
		occurred_at: datetime('When'),
		scheduled_for: datetime('Scheduled'),
		notes: text('Notes'),
		created_at: created
	},
	rma: {
		name: text('Number'),
		company: record('company'),
		contact: record('contact'),
		status: enumOf('Status', RMA_STATUS_TONE),
		requested_on: date('Requested'),
		reason: text('Reason'),
		resolution: text('Resolution'),
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
