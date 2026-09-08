import type { SupabaseClient } from '@supabase/supabase-js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { recordHref, type RecordKind } from '$lib/crm/records';
import {
	COMPANY_RELATIONSHIP_TONE,
	PARTY_STATUS_TONE,
	PRODUCT_KIND_TONE,
	STAGE_OUTCOME_TONE,
	TASK_STATE_TONE,
	TICKET_PRIORITY_TONE,
	TICKET_STATUS_TONE,
	taskState
} from '$lib/crm/tones';
import type { Database } from '$lib/database.types';
import { getCompany, type CompanyWithContacts } from './companies';
import { getContact, listContacts, type ContactWithCompany } from './contacts';
import type { CustomField } from './custom-fields';
import { getDeal, listDeals, type DealWithParties } from './deals';
import { getProduct, type ProductWithCategory } from './products';
import { getTask, listTasks, type Task, type TaskWithParties } from './tasks';
import { getTicket, listTickets, type TicketThread, type TicketWithParties } from './tickets';

/**
 * One record of any kind, as the generic record page shows it.
 *
 * The list modules (companies.ts, contacts.ts, …) each know one table. This
 * module knows how to read any of them as a *record*: something with a name,
 * a lifecycle worth a pill, a set of fields, and the other records it points
 * at. `getRecord()` branches on the kind — one branch per table, the way
 * `private.crm_entity_exists()` does in the database — and every branch ends
 * in the same `RecordDetail`, so one page renders all of them. A kind that
 * grows a specific page keeps its branch: the specific page can compose the
 * same detail and add to it.
 *
 * Fields are typed by how they should be *rendered*, never by inspecting a
 * value at runtime: a describer knows the column it is reading, so it says
 * "this is money in this currency" or "this is a link to that company" and
 * the page only has to draw it. Nothing here formats dates or amounts —
 * that is the browser's job, with the fixed locale the list pages use.
 *
 * Same contract as companies.ts: the request-scoped client and the active
 * org id, with RLS deciding what exists. The one extra input is `canOpen`:
 * whether the reader may open a record of some other kind, which decides if
 * a field naming one becomes a link and whether a related-records group is
 * fetched at all. The load derives it from the same gate `hooks.server.ts`
 * enforces, so nothing links to a page the server would refuse.
 */

/** A pill: a value and the tone the shared maps give it. */
export type Pill = { label: string; tone: BadgeTone };

/** One displayable value, typed by how the page renders it. */
export type FieldValue =
	| { type: 'empty' }
	| { type: 'text'; value: string }
	| { type: 'number'; value: number }
	| { type: 'money'; value: number; currency: string; unit: string | null }
	| { type: 'boolean'; value: boolean }
	/** A calendar date (a `date` column); rendered without a time. */
	| { type: 'date'; value: string }
	/** An instant (a `timestamptz` column); rendered with the time. */
	| { type: 'datetime'; value: string }
	/** Somewhere outside the app: a mailto, a tel, a website. */
	| { type: 'link'; value: string; href: string }
	/** Another CRM record; `href` is null when the reader may not open it. */
	| { type: 'record'; value: string; href: string | null }
	/** A member, by user id — the page resolves the name (see `$lib/server/profiles`). */
	| { type: 'person'; userId: string };

export type RecordField = { label: string; value: FieldValue };

export type RecordDetail = {
	kind: RecordKind;
	id: string;
	/** What the record is called — the page title and the heading. */
	name: string;
	/** The record's lifecycle, as pills beside its name. */
	pills: Pill[];
	fields: RecordField[];
	createdAt: string;
	updatedAt: string;
	createdBy: string | null;
};

/** Whether the reader may open a record of that kind — see the module comment. */
export type CanOpen = (kind: RecordKind) => boolean;

/** One row in a related-records group: a link, a lifecycle pill, one line of context. */
export type RelatedRecord = {
	id: string;
	name: string;
	href: string;
	pill: Pill | null;
	meta: string | null;
};

export type RelatedGroup = { kind: RecordKind; records: RelatedRecord[] };

/** Money the way the list pages print it, for the one-line meta on a related row. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

// ---------------------------------------------------------------------------
// Field constructors — a blank column is `empty`, never a dash the page has to
// recognise.
// ---------------------------------------------------------------------------

const EMPTY: FieldValue = { type: 'empty' };

/** A column's text with the whitespace gone, or null when nothing is there. */
function present(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function text(value: string | null): FieldValue {
	const shown = present(value);
	return shown ? { type: 'text', value: shown } : EMPTY;
}

function email(value: string | null): FieldValue {
	const address = present(value);
	return address ? { type: 'link', value: address, href: `mailto:${address}` } : EMPTY;
}

function phone(value: string | null): FieldValue {
	const number = present(value);
	return number
		? { type: 'link', value: number, href: `tel:${number.replace(/[^+\d]/g, '')}` }
		: EMPTY;
}

/** Websites are stored as typed; a bare domain still needs a scheme to be a link. */
function website(value: string | null): FieldValue {
	const url = present(value);
	if (!url) return EMPTY;
	return { type: 'link', value: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` };
}

function money(value: number | null, currency = 'USD', unit: string | null = null): FieldValue {
	return value === null ? EMPTY : { type: 'money', value, currency, unit };
}

function count(value: number | null): FieldValue {
	return value === null ? EMPTY : { type: 'number', value };
}

function date(value: string | null): FieldValue {
	return value ? { type: 'date', value } : EMPTY;
}

function datetime(value: string | null): FieldValue {
	return value ? { type: 'datetime', value } : EMPTY;
}

function yesNo(value: boolean): FieldValue {
	return { type: 'boolean', value };
}

function person(userId: string | null): FieldValue {
	return userId ? { type: 'person', userId } : EMPTY;
}

/** A field naming another record: a link when the reader may open that kind. */
function record(
	kind: RecordKind,
	target: { id: string; name: string } | null,
	canOpen: CanOpen
): FieldValue {
	if (!target) return EMPTY;
	return {
		type: 'record',
		value: target.name,
		href: canOpen(kind) ? recordHref(kind, target.id) : null
	};
}

/** A pill labelled the way `DataTable.statusCell` labels an enum: title-cased. */
function pill(value: string, tone: BadgeTone): Pill {
	return { label: value.charAt(0).toUpperCase() + value.slice(1), tone };
}

// ---------------------------------------------------------------------------
// Describers — one per kind. Pure, so a test can hand one a row.
// ---------------------------------------------------------------------------

export function describeCompany(row: CompanyWithContacts): RecordDetail {
	return {
		kind: 'company',
		id: row.id,
		name: row.name,
		pills: [
			pill(row.relationship, COMPANY_RELATIONSHIP_TONE[row.relationship]),
			pill(row.status, PARTY_STATUS_TONE[row.status])
		],
		fields: [
			{ label: 'Email', value: email(row.email) },
			{ label: 'Phone', value: phone(row.phone) },
			{ label: 'Website', value: website(row.website) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeContact(row: ContactWithCompany, canOpen: CanOpen): RecordDetail {
	return {
		kind: 'contact',
		id: row.id,
		name: row.name,
		pills: [pill(row.status, PARTY_STATUS_TONE[row.status])],
		fields: [
			// Blank, not an error: a patient or a homeowner is the customer
			// themselves and belongs to no company.
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Title', value: text(row.title) },
			{ label: 'Email', value: email(row.email) },
			{ label: 'Phone', value: phone(row.phone) },
			{ label: 'Primary contact', value: yesNo(row.is_primary) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeProduct(row: ProductWithCategory): RecordDetail {
	const fields: RecordField[] = [
		{ label: 'Category', value: text(row.product_categories?.name ?? null) },
		{ label: 'SKU', value: text(row.sku) },
		{ label: 'Description', value: text(row.description) },
		{ label: 'Unit price', value: money(row.unit_price, row.currency, row.unit) },
		{ label: 'Unit cost', value: money(row.unit_cost, row.currency, row.unit) },
		{ label: 'Tracks inventory', value: yesNo(row.track_inventory) }
	];
	// Only goods carry stock, so a service shows no quantity rather than a
	// misleading zero — the list page's rule.
	if (row.track_inventory) fields.push({ label: 'On hand', value: count(row.quantity_on_hand) });

	const pills = [pill(row.kind, PRODUCT_KIND_TONE[row.kind])];
	// Active is the normal state; only the exception earns a pill.
	if (!row.is_active) pills.push(pill('inactive', 'neutral'));

	return {
		kind: 'product',
		id: row.id,
		name: row.name,
		pills,
		fields,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeDeal(row: DealWithParties, canOpen: CanOpen): RecordDetail {
	return {
		kind: 'deal',
		id: row.id,
		name: row.title,
		pills: [pill(row.pipeline_stages.name, STAGE_OUTCOME_TONE[row.pipeline_stages.outcome])],
		fields: [
			// A deal names a company, a person, or neither — an opportunity
			// nobody is attached to yet is a legitimate row.
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Contact', value: record('contact', row.contacts, canOpen) },
			{ label: 'Amount', value: money(row.amount) },
			{ label: 'Expected close', value: date(row.expected_close_date) },
			{ label: 'Assigned to', value: person(row.assigned_to) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeTask(row: TaskWithParties, canOpen: CanOpen): RecordDetail {
	const state = taskState(row);
	return {
		kind: 'task',
		id: row.id,
		name: row.title,
		pills: [pill(state, TASK_STATE_TONE[state])],
		fields: [
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Contact', value: record('contact', row.contacts, canOpen) },
			{ label: 'Details', value: text(row.details) },
			{ label: 'Due', value: datetime(row.due_at) },
			{ label: 'Completed', value: datetime(row.completed_at) },
			{ label: 'Assigned to', value: person(row.assigned_to) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeTicket(row: TicketThread, canOpen: CanOpen): RecordDetail {
	return {
		kind: 'ticket',
		id: row.id,
		name: row.subject,
		pills: [
			pill(row.status, TICKET_STATUS_TONE[row.status]),
			pill(row.priority, TICKET_PRIORITY_TONE[row.priority])
		],
		fields: [
			{ label: 'Number', value: text(`#${String(row.number)}`) },
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Contact', value: record('contact', row.contacts, canOpen) },
			{ label: 'Description', value: text(row.description) },
			{ label: 'Assigned to', value: person(row.assigned_to) },
			// The thread itself is a specific ticket page's job; the generic one
			// says how long it is.
			{ label: 'Comments', value: count(row.ticket_comments.length) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

/** A custom field as a record field, keyed by the definition's `key` (unique per org and kind; labels are not). */
export type CustomRecordField = RecordField & { key: string };

/**
 * A custom field as a record field: the definition's label and the value in
 * the column its type uses — or empty, when this record has not filled it in.
 */
export function describeCustomField({ definition, value }: CustomField): CustomRecordField {
	const { key, label } = definition;
	if (!value) return { key, label, value: EMPTY };
	switch (definition.value_type) {
		case 'text':
		case 'select':
			return { key, label, value: text(value.value_text) };
		case 'numeric':
			return { key, label, value: count(value.value_numeric) };
		case 'boolean':
			return {
				key,
				label,
				value: value.value_boolean === null ? EMPTY : yesNo(value.value_boolean)
			};
	}
}

// ---------------------------------------------------------------------------
// Reading a record
// ---------------------------------------------------------------------------

/**
 * One record, by kind and id, or null when it does not exist in the org (or
 * RLS says it does not — the two are indistinguishable on purpose).
 */
export async function getRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: RecordKind,
	id: string,
	canOpen: CanOpen
): Promise<RecordDetail | null> {
	switch (kind) {
		case 'company': {
			const row = await getCompany(supabase, orgId, id);
			return row && describeCompany(row);
		}
		case 'contact': {
			const row = await getContact(supabase, orgId, id);
			return row && describeContact(row, canOpen);
		}
		case 'product': {
			const row = await getProduct(supabase, orgId, id);
			return row && describeProduct(row);
		}
		case 'deal': {
			const row = await getDeal(supabase, orgId, id);
			return row && describeDeal(row, canOpen);
		}
		case 'task': {
			const row = await getTask(supabase, orgId, id);
			return row && describeTask(row, canOpen);
		}
		case 'ticket': {
			const row = await getTicket(supabase, orgId, id);
			return row && describeTicket(row, canOpen);
		}
	}
}

// ---------------------------------------------------------------------------
// The records that point at this one
// ---------------------------------------------------------------------------

function relatedContact(row: ContactWithCompany): RelatedRecord {
	return {
		id: row.id,
		name: row.name,
		href: recordHref('contact', row.id),
		pill: pill(row.status, PARTY_STATUS_TONE[row.status]),
		meta: row.title ?? row.email
	};
}

function relatedDeal(row: DealWithParties): RelatedRecord {
	return {
		id: row.id,
		name: row.title,
		href: recordHref('deal', row.id),
		pill: pill(row.pipeline_stages.name, STAGE_OUTCOME_TONE[row.pipeline_stages.outcome]),
		meta: row.amount === null ? null : usd.format(row.amount)
	};
}

function relatedTask(row: Task): RelatedRecord {
	const state = taskState(row);
	return {
		id: row.id,
		name: row.title,
		href: recordHref('task', row.id),
		pill: pill(state, TASK_STATE_TONE[state]),
		meta: row.due_at ? `Due ${mediumDate.format(new Date(row.due_at))}` : null
	};
}

function relatedTicket(row: TicketWithParties): RelatedRecord {
	return {
		id: row.id,
		name: row.subject,
		href: recordHref('ticket', row.id),
		pill: pill(row.status, TICKET_STATUS_TONE[row.status]),
		meta: `#${String(row.number)} · ${row.priority} priority`
	};
}

/**
 * The records that reference this one, grouped by kind, in the order the
 * sidebar lists those kinds. Only the parties collect other records — a
 * deal, a task and a ticket each name a company and a person, so a company
 * or a contact page lists the ones naming it. A group is fetched only when
 * the reader may open that kind (`canOpen`), so nothing is shown that its
 * own list page would refuse, and an empty group is omitted rather than
 * rendered as an empty card.
 */
export async function listRelatedRecords(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: RecordKind,
	id: string,
	canOpen: CanOpen
): Promise<RelatedGroup[]> {
	if (kind !== 'company' && kind !== 'contact') return [];
	const filter = kind === 'company' ? { companyId: id } : { contactId: id };

	const groups = await Promise.all([
		kind === 'company' && canOpen('contact')
			? listContacts(supabase, orgId, filter).then((rows): RelatedGroup => ({
					kind: 'contact',
					records: rows.map(relatedContact)
				}))
			: null,
		canOpen('deal')
			? listDeals(supabase, orgId, filter).then((rows): RelatedGroup => ({
					kind: 'deal',
					records: rows.map(relatedDeal)
				}))
			: null,
		canOpen('task')
			? listTasks(supabase, orgId, filter).then((rows): RelatedGroup => ({
					kind: 'task',
					records: rows.map(relatedTask)
				}))
			: null,
		canOpen('ticket')
			? listTickets(supabase, orgId, filter).then((rows): RelatedGroup => ({
					kind: 'ticket',
					records: rows.map(relatedTicket)
				}))
			: null
	]);

	return groups.filter(
		(group): group is RelatedGroup => group !== null && group.records.length > 0
	);
}
