import { z } from 'zod';
import type { FeatureId } from '$lib/features/types';
import { QUERY } from '$lib/queries';

/**
 * The create-a-record registry — one table describing every kind of object a
 * list page can add, and the single generic form that adds it.
 *
 * A record type says three things: what it is called, which feature owns it
 * (the permission the writer needs, and the query key its list depends on),
 * and the fields the form asks for. `CreateRecord` renders those fields,
 * `$lib/server/records.ts` validates the post against the same schema and
 * hands the values to the matching `$lib/server/crm/*` module. Adding a kind
 * of record = a schema, a `RECORD_FORMS` entry, and one `case` in that
 * module's insert switch — no new form, action or modal.
 *
 * **Every field posts a string.** One component renders one input per field
 * and nothing needs a per-type binding, which is what makes the form generic;
 * the server turns the strings into columns (blank → null, an amount into a
 * number, a picked instant into an ISO timestamp) inside that one switch.
 * Client-safe like every schema module — no `$lib/server` imports.
 *
 * The fields are the record's own columns, plus the two that point it at a
 * party: a `company` or `contact` field is a picker whose options
 * `loadCreateRecord()` reads per request (an invoice is a bill to someone,
 * so it cannot be created without one). Still one form — the picker is a
 * field type, not a second modal.
 *
 * A proposal is not here on purpose: it is a title plus one to five priced
 * options made of catalog lines — more than one row of strings — so it has
 * the builder page at `src/routes/(app)/proposals/new/` instead, the one
 * kind whose creation is a screen rather than this modal. A task is listed
 * but created elsewhere too: the tasks page's own modal writes the row and
 * its `assigned_to` relationships in one post (docs/tasks.md), and its entry
 * here is what the record page EDITS a task with.
 */

/** Kinds of record the generic form can create. */
export const RECORD_TYPES = [
	'company',
	'contact',
	'deal',
	'product',
	'billable',
	'asset',
	'invoice',
	'task',
	'ticket'
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/** What every record form's values look like: one string per field. */
export type RecordFormValues = Record<string, string>;

export type RecordFieldOption = { value: string; label: string; sublabel?: string };

/**
 * The kinds of row a record form can point at — each a picker whose options
 * are the org's own rows rather than a vocabulary the registry can hold: the
 * two parties, and the stage a deal sits in (its board is `pipelines` rows,
 * so the choices differ per org and per industry).
 */
export const RECORD_PICKER_KINDS = ['company', 'contact', 'stage'] as const;

export type RecordPickerKind = (typeof RECORD_PICKER_KINDS)[number];

/** The options behind each picker on a form, loaded per request by `loadCreateRecord()`. */
export type RecordPickers = Partial<Record<RecordPickerKind, readonly RecordFieldOption[]>>;

/**
 * How one field is rendered. `select` is a fixed vocabulary this app owns (an
 * enum column) and renders as a `Combobox`; `number` is money or a measure
 * and `integer` a count (days of terms); `datetime` is a wall-clock pick the
 * browser converts to an instant before posting; `company`, `contact` and
 * `stage` are pickers over the org's own rows, whose options arrive with the
 * form rather than sitting in the registry.
 */
export type RecordField = {
	name: string;
	label: string;
	type:
		| 'text'
		| 'email'
		| 'tel'
		| 'number'
		| 'integer'
		| 'date'
		| 'datetime'
		| 'textarea'
		| 'select'
		| RecordPickerKind;
	placeholder?: string;
	/** Required for `type: 'select'`, meaningless otherwise. */
	options?: readonly RecordFieldOption[];
	/** Span both columns of the form grid — long text, mostly. */
	wide?: boolean;
};

export type RecordForm = {
	/**
	 * The feature that owns the record: `manage` on it is what creating needs,
	 * and its terms are what the button, the modal and the toast call the
	 * record ("Add quote") — see `recordTerms()` in `$lib/crm/records`.
	 */
	feature: FeatureId;
	/** The list this creates a row in, so the page refreshes and nothing else does. */
	query: string;
	fields: readonly RecordField[];
};

// --- Field building blocks ---------------------------------------------------
//
// Zod messages are user-facing copy, so they are written as sentences. Blank
// is the empty string rather than undefined throughout: an HTML form posts
// "not filled in" as '', and the server is the one place that turns it into a
// null column.

const email = z.email();

const requiredText = (label: string) =>
	z
		.string()
		.trim()
		.min(1, `${label} is required.`)
		.max(200, `${label} must be 200 characters or fewer.`);

const optionalText = z.string().trim().max(200, 'Must be 200 characters or fewer.').default('');

const optionalEmail = z
	.string()
	.trim()
	.max(200, 'Must be 200 characters or fewer.')
	.refine((value) => value === '' || email.safeParse(value).success, {
		error: 'Enter a valid email address.'
	})
	.default('');

const optionalLongText = z
	.string()
	.trim()
	.max(2000, 'Must be 2000 characters or fewer.')
	.default('');

/** Money as typed: blank, or digits with up to two decimals. */
const optionalAmount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 1200 or 1200.50')
	.default('');

/** A whole number as typed, or blank: days of terms, a count. */
const optionalInteger = z
	.string()
	.trim()
	.regex(/^$|^\d{1,4}$/, 'Enter a whole number.')
	.default('');

/** A row picked from a party picker, or blank for none. */
const optionalPick = z.guid().or(z.literal('')).default('');

/** What `<input type="date">` posts. */
const optionalDate = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
	.default('');

/**
 * A wall-clock pick, or the instant the browser turned it into. The client
 * converts `2026-09-10T17:00` to an ISO string with the viewer's offset before
 * posting, so both shapes are legal here — and without JavaScript the naive
 * form still arrives and is read as UTC.
 *
 * Exported because a record's date is picked in more than one place — the
 * create form, and the task board's cards — and two spellings of "what a date
 * input posts" is how one of them starts rejecting what the other sends.
 */
export const optionalInstant = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/, {
		error: 'Choose a date and time.'
	})
	.default('');

// --- The schemas -------------------------------------------------------------
//
// Each one mirrors the columns its `$lib/server/crm/*` module accepts on
// insert. They stay exported so the server can re-parse the validated values
// and get the enum unions back — the generic form erases them to strings.

export const companyRecordSchema = z.object({
	name: requiredText('Name'),
	relationship: z.enum(['customer', 'supplier', 'partner', 'other']).default('customer'),
	status: z.enum(['lead', 'prospect', 'active', 'inactive']).default('lead'),
	email: optionalEmail,
	phone: optionalText,
	website: optionalText
});

export const contactRecordSchema = z.object({
	name: requiredText('Name'),
	title: optionalText,
	email: optionalEmail,
	phone: optionalText,
	status: z.enum(['lead', 'prospect', 'active', 'inactive']).default('lead')
});

export const dealRecordSchema = z.object({
	title: requiredText('Title'),
	/**
	 * Where the deal sits on a board. Blank on create means "the org's default
	 * board, first stage" (`crm/deals.ts` places it); blank on edit means the
	 * same, which is why nothing here is required — a deal always has a stage,
	 * but the form never has to know which one.
	 */
	stage_id: optionalPick,
	amount: optionalAmount,
	expected_close_date: optionalDate
});

export const productRecordSchema = z.object({
	name: requiredText('Name'),
	kind: z.enum(['good', 'service']).default('good'),
	sku: optionalText,
	unit_price: optionalAmount,
	unit_cost: optionalAmount,
	unit: optionalText,
	description: optionalLongText
});

export const billableRecordSchema = z.object({
	name: requiredText('Name'),
	code: optionalText,
	unit_price: optionalAmount,
	unit: optionalText,
	/** Comma-separated; the server splits it into the array the column holds. */
	unit_choices: optionalText,
	is_featured: z.enum(['true', 'false']).default('false'),
	description: optionalLongText
});

export const assetRecordSchema = z.object({
	name: requiredText('Name'),
	asset_type: optionalText,
	identifier: optionalText,
	status: z.enum(['active', 'inactive', 'retired']).default('active'),
	acquired_on: optionalDate,
	purchase_price: optionalAmount,
	description: optionalLongText
});

/**
 * A draft: who it bills and on what terms. The lines come after, on the
 * invoice's own page, and issuing it is a separate act — a bill to nobody
 * is refused here, exactly as the table's check refuses it.
 */
export const invoiceRecordSchema = z
	.object({
		company_id: optionalPick,
		contact_id: optionalPick,
		payment_terms_days: optionalInteger,
		due_date: optionalDate,
		billing_email: optionalEmail,
		memo: optionalLongText
	})
	.refine((data) => data.company_id !== '' || data.contact_id !== '', {
		error: 'Pick a company or a person to bill.',
		path: ['company_id']
	});

export const taskRecordSchema = z.object({
	title: requiredText('Title'),
	priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
	due_at: optionalInstant,
	details: optionalLongText
});

export const ticketRecordSchema = z.object({
	subject: requiredText('Subject'),
	priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
	description: optionalLongText
});

/**
 * The schema behind each record type, as the generic form and its action use
 * it: widened to "an object of strings", because neither knows which type it
 * is handling at compile time. The concrete schemas above are how the server
 * narrows back to the enum unions the columns want.
 */
type RecordSchemas = { [K in RecordType]: z.ZodType<RecordFormValues> };

export const RECORD_SCHEMAS: RecordSchemas = {
	company: companyRecordSchema,
	contact: contactRecordSchema,
	deal: dealRecordSchema,
	product: productRecordSchema,
	billable: billableRecordSchema,
	asset: assetRecordSchema,
	invoice: invoiceRecordSchema,
	task: taskRecordSchema,
	ticket: ticketRecordSchema
};

/** One vocabulary, shared by tasks and tickets (the `priority` enum). */
export const PRIORITY_OPTIONS = [
	{ value: 'low', label: 'Low' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' }
] as const;

const PARTY_STATUS_OPTIONS = [
	{ value: 'lead', label: 'Lead' },
	{ value: 'prospect', label: 'Prospect' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' }
] as const;

type RecordFormRegistry = { [K in RecordType]: RecordForm };

export const RECORD_FORMS: RecordFormRegistry = {
	company: {
		feature: 'companies',
		query: QUERY.companies,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Acme Corporation' },
			{
				name: 'relationship',
				label: 'Relationship',
				type: 'select',
				options: [
					{ value: 'customer', label: 'Customer' },
					{ value: 'supplier', label: 'Supplier' },
					{ value: 'partner', label: 'Partner' },
					{ value: 'other', label: 'Other' }
				]
			},
			{ name: 'status', label: 'Status', type: 'select', options: PARTY_STATUS_OPTIONS },
			{ name: 'email', label: 'Email', type: 'email', placeholder: 'hello@acme.com' },
			{ name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 010 0100' },
			{ name: 'website', label: 'Website', type: 'text', placeholder: 'acme.com' }
		]
	},
	contact: {
		feature: 'contacts',
		query: QUERY.contacts,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Dana Reyes' },
			{ name: 'title', label: 'Job title', type: 'text', placeholder: 'Head of Operations' },
			{ name: 'email', label: 'Email', type: 'email', placeholder: 'dana@acme.com' },
			{ name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 010 0100' },
			{ name: 'status', label: 'Status', type: 'select', options: PARTY_STATUS_OPTIONS }
		]
	},
	deal: {
		feature: 'deals',
		query: QUERY.deals,
		// Stage is second because moving one is the commonest edit a deal ever
		// gets — the funnel is the reason the record exists.
		fields: [
			{ name: 'title', label: 'Title', type: 'text', placeholder: 'Annual renewal' },
			{ name: 'stage_id', label: 'Stage', type: 'stage' },
			{ name: 'amount', label: 'Amount', type: 'number', placeholder: '12000' },
			{ name: 'expected_close_date', label: 'Expected close', type: 'date' }
		]
	},
	product: {
		feature: 'products',
		query: QUERY.products,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Standard installation' },
			{
				name: 'kind',
				label: 'Kind',
				type: 'select',
				options: [
					{ value: 'good', label: 'Good' },
					{ value: 'service', label: 'Service' }
				]
			},
			{ name: 'sku', label: 'SKU', type: 'text', placeholder: 'INST-001' },
			{ name: 'unit_price', label: 'Unit price', type: 'number', placeholder: '499.00' },
			{ name: 'unit_cost', label: 'Unit cost', type: 'number', placeholder: '250.00' },
			{ name: 'unit', label: 'Unit', type: 'text', placeholder: 'each' },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	billable: {
		feature: 'billables',
		query: QUERY.billables,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Porcelain crown' },
			{ name: 'code', label: 'Code', type: 'text', placeholder: 'D2740' },
			{ name: 'unit_price', label: 'Unit price', type: 'number', placeholder: '1450.00' },
			{ name: 'unit', label: 'Unit', type: 'text', placeholder: 'tooth' },
			{
				name: 'unit_choices',
				label: 'Unit choices',
				type: 'text',
				placeholder: 'UR, UL, BR, BL — blank to type units in',
				wide: true
			},
			{
				name: 'is_featured',
				label: 'Featured',
				type: 'select',
				options: [
					{ value: 'false', label: 'Found by search' },
					{ value: 'true', label: 'Shown on every option' }
				]
			},
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	asset: {
		feature: 'assets',
		query: QUERY.assets,
		// Who owns or holds it is deliberately not a field: that is a
		// relationship, drawn on the record once it exists.
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'MacBook Pro 16"' },
			{ name: 'asset_type', label: 'Type', type: 'text', placeholder: 'device' },
			{ name: 'identifier', label: 'Identifier', type: 'text', placeholder: 'IT-001' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'active', label: 'Active' },
					{ value: 'inactive', label: 'Inactive' },
					{ value: 'retired', label: 'Retired' }
				]
			},
			{ name: 'acquired_on', label: 'Acquired', type: 'date' },
			{ name: 'purchase_price', label: 'Purchase price', type: 'number', placeholder: '2399.00' },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	invoice: {
		feature: 'invoices',
		query: QUERY.invoices,
		fields: [
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'payment_terms_days', label: 'Terms (days)', type: 'integer', placeholder: '30' },
			{ name: 'due_date', label: 'Due', type: 'date' },
			{ name: 'billing_email', label: 'Billing email', type: 'email', placeholder: 'ap@acme.com' },
			{
				name: 'memo',
				label: 'Memo',
				type: 'textarea',
				placeholder: 'Shown on the invoice',
				wide: true
			}
		]
	},
	task: {
		feature: 'tasks',
		query: QUERY.tasks,
		fields: [
			{ name: 'title', label: 'Title', type: 'text', placeholder: 'Call back about the quote' },
			{ name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
			{ name: 'due_at', label: 'Due', type: 'datetime' },
			{ name: 'details', label: 'Details', type: 'textarea', wide: true }
		]
	},
	ticket: {
		feature: 'tickets',
		query: QUERY.tickets,
		fields: [
			{ name: 'subject', label: 'Subject', type: 'text', placeholder: 'Panel is offline' },
			{ name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	}
};
