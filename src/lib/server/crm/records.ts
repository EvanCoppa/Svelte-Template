import type { SupabaseClient } from '@supabase/supabase-js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { recommendedOption } from '$lib/crm/proposals';
import { recordHref, type RecordKind } from '$lib/crm/records';
import {
	ASSET_STATUS_TONE,
	COMPANY_RELATIONSHIP_TONE,
	INVOICE_STATUS_TONE,
	PARTY_STATUS_TONE,
	PAYMENT_STATE_TONE,
	PRODUCT_KIND_TONE,
	PROPOSAL_STATUS_TONE,
	STAGE_OUTCOME_TONE,
	PRIORITY_TONE,
	TASK_STATUS_LABEL,
	TASK_STATUS_TONE,
	TICKET_STATUS_TONE
} from '$lib/crm/tones';
import type { Database } from '$lib/database.types';
import type { Vocabulary } from '$lib/features/vocabulary';
import { capitalize } from '$lib/utils.js';
import { getAsset, listAssets, type Asset } from './assets';
import { getBillable, listBillables, type Billable } from './billables';
import { getCompany, listCompanies, type CompanyWithContacts } from './companies';
import { getContact, listContacts, type ContactWithCompany } from './contacts';
import type { CustomField } from './custom-fields';
import { getDeal, listDeals, type DealWithParties } from './deals';
import {
	getInvoice,
	listInvoices,
	type InvoiceWithDetails,
	type InvoiceWithParties
} from './invoices';
import { getProduct, listProducts, type ProductWithCategory } from './products';
import {
	getProposal,
	listProposals,
	proposalParentKind,
	type ProposalParentKind,
	type ProposalWithOptions
} from './proposals';
import type { CrmEntityType } from './entity';
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
	return { label: capitalize(value), tone };
}

/** Money the way the list pages print it, in the row's own currency. */
function moneyText(value: number, currency: string): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

// ---------------------------------------------------------------------------
// Describers — one per kind. Pure, so a test can hand one a row.
// ---------------------------------------------------------------------------

export function describeAsset(row: Asset): RecordDetail {
	return {
		kind: 'asset',
		id: row.id,
		name: row.name,
		pills: [pill(row.status, ASSET_STATUS_TONE[row.status])],
		// Who owns or holds it is not a field: it is a relationship, drawn by
		// the page from `getRelationships()` beside every other kind's.
		fields: [
			{ label: 'Type', value: text(row.asset_type) },
			{ label: 'Identifier', value: text(row.identifier) },
			{ label: 'Description', value: text(row.description) },
			{ label: 'Acquired', value: date(row.acquired_on) },
			{ label: 'Disposed', value: date(row.disposed_on) },
			{ label: 'Purchase price', value: money(row.purchase_price, row.currency) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeBillable(row: Billable): RecordDetail {
	const pills: Pill[] = [];
	// Featured is the exception worth a pill: it is on every option's checklist.
	if (row.is_featured) pills.push(pill('featured', 'info'));
	if (!row.is_active) pills.push(pill('inactive', 'neutral'));
	return {
		kind: 'billable',
		id: row.id,
		name: row.name,
		pills,
		fields: [
			{ label: 'Code', value: text(row.code) },
			{ label: 'Description', value: text(row.description) },
			{ label: 'Unit price', value: money(row.unit_price, row.currency, row.unit) },
			// The units the builder offers as chips; blank means they are typed in.
			{ label: 'Unit choices', value: text(row.unit_choices?.join(', ') ?? null) },
			{ label: 'Featured', value: yesNo(row.is_featured) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

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

/** The record a proposal hangs off, resolved through that kind's own module. */
export type ProposalParent = { kind: ProposalParentKind; id: string; name: string };

/**
 * The two people every proposal names, labelled as the org's industry
 * labels them ("Presenter" / "Provider", "Estimator" / "Project manager") —
 * the one describer that needs the vocabulary, because the labels are not
 * the columns' names.
 */
export function describeProposal(
	row: ProposalWithOptions,
	parent: ProposalParent | null,
	canOpen: CanOpen,
	vocabulary: Vocabulary
): RecordDetail {
	const options = [...row.proposal_options].sort((a, b) => a.sort_order - b.sort_order);
	const recommended = recommendedOption(options);
	const selected = options.find((option) => option.id === row.selected_option_id) ?? null;
	return {
		kind: 'proposal',
		id: row.id,
		name: row.title,
		pills: [pill(row.status, PROPOSAL_STATUS_TONE[row.status])],
		fields: [
			// Unattached is a legitimate state (a draft), and a deleted parent
			// detaches rather than cascades — so blank, never an error.
			{ label: 'For', value: parent ? record(parent.kind, parent, canOpen) : EMPTY },
			{ label: vocabulary.proposal_presenter, value: person(row.presenter_id) },
			{ label: vocabulary.proposal_responsible, value: person(row.responsible_id) },
			{ label: 'Options', value: count(options.length) },
			{ label: 'Recommended option', value: text(recommended?.label ?? null) },
			{
				label: 'Recommended total',
				value: recommended ? money(recommended.computed_total, recommended.currency) : EMPTY
			},
			{ label: 'Selected option', value: text(selected?.label ?? null) },
			{ label: 'Valid until', value: datetime(row.valid_until) },
			{ label: 'Default fee', value: money(row.default_fee) },
			{ label: 'Tax rate', value: row.tax_rate === null ? EMPTY : text(`${String(row.tax_rate)}%`) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

/**
 * An invoice is named by its number and read by its money: the status pill
 * says where the document is, the payment pill how much of it has arrived.
 * Overdue is not a pill here: it is a wall-clock word (the invoicing
 * migration's decision 4), and the billing block asks it of the viewer's
 * own date. The lines and the payments are that block, not fields.
 */
export function describeInvoice(row: InvoiceWithDetails, canOpen: CanOpen): RecordDetail {
	const pills = [pill(row.status, INVOICE_STATUS_TONE[row.status])];
	// A draft asks for nothing yet and a void one never will; only an issued
	// invoice has a money state worth a second pill.
	if (row.status === 'issued') {
		pills.push(pill(row.payment_status, PAYMENT_STATE_TONE[row.payment_status]));
	}
	return {
		kind: 'invoice',
		id: row.id,
		name: row.number,
		pills,
		fields: [
			// One of the two is always named (the ledger migration's check);
			// a bill to a person at a company names both.
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Contact', value: record('contact', row.contacts, canOpen) },
			{ label: 'Issued', value: datetime(row.issued_at) },
			{ label: 'Due', value: date(row.due_date) },
			{
				label: 'Terms',
				value:
					row.payment_terms_days === null ? EMPTY : text(`Net ${String(row.payment_terms_days)}`)
			},
			{ label: 'Total', value: money(row.total, row.currency) },
			{ label: 'Paid', value: money(row.amount_paid, row.currency) },
			{ label: 'Balance due', value: money(row.balance_due, row.currency) },
			{ label: 'Billing email', value: email(row.billing_email) },
			// Shown to the customer; `notes` is not.
			{ label: 'Memo', value: text(row.memo) },
			{ label: 'Internal notes', value: text(row.notes) },
			{ label: 'Voided', value: datetime(row.voided_at) }
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBy: row.created_by
	};
}

export function describeTask(row: TaskWithParties, canOpen: CanOpen): RecordDetail {
	return {
		kind: 'task',
		id: row.id,
		name: row.title,
		pills: [
			pill(TASK_STATUS_LABEL[row.status], TASK_STATUS_TONE[row.status]),
			pill(row.priority, PRIORITY_TONE[row.priority])
		],
		// No "Assigned to" field: a task's assignees are relationships, and
		// the Relationships card draws them with everything else the record
		// is linked to.
		fields: [
			{ label: 'Company', value: record('company', row.companies, canOpen) },
			{ label: 'Contact', value: record('contact', row.contacts, canOpen) },
			{ label: 'Details', value: text(row.details) },
			{ label: 'Due', value: datetime(row.due_at) },
			{ label: 'Completed', value: datetime(row.completed_at) }
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
			pill(row.priority, PRIORITY_TONE[row.priority])
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
	canOpen: CanOpen,
	vocabulary: Vocabulary
): Promise<RecordDetail | null> {
	switch (kind) {
		case 'asset': {
			const row = await getAsset(supabase, orgId, id);
			return row && describeAsset(row);
		}
		case 'billable': {
			const row = await getBillable(supabase, orgId, id);
			return row && describeBillable(row);
		}
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
		case 'proposal': {
			const row = await getProposal(supabase, orgId, id);
			return (
				row &&
				describeProposal(
					row,
					await resolveProposalParent(supabase, orgId, row),
					canOpen,
					vocabulary
				)
			);
		}
		case 'invoice': {
			const row = await getInvoice(supabase, orgId, id);
			return row && describeInvoice(row, canOpen);
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

/** A record by id and the one word for it: what a map or a picker needs. */
export type RecordName = { id: string; name: string };

/**
 * Every record of one kind, named the way `getRecord()` names it and
 * nothing else — the cheap half of a record, for a surface that draws all
 * of them at once (the graph page).
 *
 * One branch per kind like `getRecord()`, each going through that kind's
 * own list module, so the name a row carries here is the same string the
 * record page puts at the top of it. RLS decides what is in the list, so a
 * reader sees exactly the records they could open by clicking through — the
 * caller still asks `canOpen()` first, because a kind the feature gate
 * hides is not fetched at all.
 */
export async function listRecordNames(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: RecordKind
): Promise<RecordName[]> {
	switch (kind) {
		case 'asset':
			return (await listAssets(supabase, orgId)).map((row) => ({ id: row.id, name: row.name }));
		case 'billable':
			return (await listBillables(supabase, orgId)).map((row) => ({ id: row.id, name: row.name }));
		case 'company':
			return (await listCompanies(supabase, orgId)).map((row) => ({ id: row.id, name: row.name }));
		case 'contact':
			return (await listContacts(supabase, orgId)).map((row) => ({ id: row.id, name: row.name }));
		case 'product':
			return (await listProducts(supabase, orgId)).map((row) => ({ id: row.id, name: row.name }));
		case 'deal':
			return (await listDeals(supabase, orgId)).map((row) => ({ id: row.id, name: row.title }));
		case 'proposal':
			return (await listProposals(supabase, orgId)).map((row) => ({ id: row.id, name: row.title }));
		case 'invoice':
			return (await listInvoices(supabase, orgId)).map((row) => ({ id: row.id, name: row.number }));
		case 'task':
			return (await listTasks(supabase, orgId)).map((row) => ({ id: row.id, name: row.title }));
		case 'ticket':
			return (await listTickets(supabase, orgId)).map((row) => ({ id: row.id, name: row.subject }));
	}
}

/**
 * The record a proposal hangs off (or is about to), read through that
 * kind's own module — one branch per parent kind, the way
 * `private.crm_entity_exists()` has one. Null when the link is unset or
 * names no kind a proposal may hang off, or when the parent is gone or RLS
 * hides it. The builder resolves the link it is about to write with the
 * same function, so a proposal is never created for a record the writer
 * cannot see.
 */
export async function resolveProposalParent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	link: { entity_type: CrmEntityType | null; entity_id: string | null }
): Promise<ProposalParent | null> {
	const kind = proposalParentKind(link.entity_type);
	if (kind === null || link.entity_id === null) return null;
	switch (kind) {
		case 'company': {
			const parent = await getCompany(supabase, orgId, link.entity_id);
			return parent && { kind, id: parent.id, name: parent.name };
		}
		case 'contact': {
			const parent = await getContact(supabase, orgId, link.entity_id);
			return parent && { kind, id: parent.id, name: parent.name };
		}
		case 'deal': {
			const parent = await getDeal(supabase, orgId, link.entity_id);
			return parent && { kind, id: parent.id, name: parent.title };
		}
	}
}

/** The lookup key `resolveProposalParents()` fills and the proposals list reads. */
export function proposalParentKey(kind: ProposalParentKind, id: string): string {
	return `${kind}:${id}`;
}

/**
 * The records many proposals hang off, in three queries rather than one per
 * row — the proposals list's version of `resolveProposalParent()` above.
 * Grouped by kind first, so a page of a hundred proposals against a dozen
 * companies still reads each company once.
 */
export async function resolveProposalParents(
	supabase: SupabaseClient<Database>,
	orgId: string,
	rows: readonly { entity_type: CrmEntityType | null; entity_id: string | null }[]
): Promise<ReadonlyMap<string, ProposalParent>> {
	const idsByKind = new Map<ProposalParentKind, string[]>();
	for (const row of rows) {
		const kind = proposalParentKind(row.entity_type);
		if (kind === null || row.entity_id === null) continue;
		const ids = idsByKind.get(kind) ?? [];
		ids.push(row.entity_id);
		idsByKind.set(kind, ids);
	}
	const companyIds = idsByKind.get('company') ?? [];
	const contactIds = idsByKind.get('contact') ?? [];
	const dealIds = idsByKind.get('deal') ?? [];

	const [companies, contacts, deals] = await Promise.all([
		companyIds.length ? listCompanies(supabase, orgId, { ids: companyIds }) : [],
		contactIds.length ? listContacts(supabase, orgId, { ids: contactIds }) : [],
		dealIds.length ? listDeals(supabase, orgId, { ids: dealIds }) : []
	]);

	const parents = new Map<string, ProposalParent>();
	for (const company of companies) {
		parents.set(proposalParentKey('company', company.id), {
			kind: 'company',
			id: company.id,
			name: company.name
		});
	}
	for (const contact of contacts) {
		parents.set(proposalParentKey('contact', contact.id), {
			kind: 'contact',
			id: contact.id,
			name: contact.name
		});
	}
	for (const deal of deals) {
		parents.set(proposalParentKey('deal', deal.id), {
			kind: 'deal',
			id: deal.id,
			name: deal.title
		});
	}
	return parents;
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

function relatedProposal(row: ProposalWithOptions): RelatedRecord {
	const recommended = recommendedOption(row.proposal_options);
	const n = row.proposal_options.length;
	return {
		id: row.id,
		name: row.title,
		href: recordHref('proposal', row.id),
		pill: pill(row.status, PROPOSAL_STATUS_TONE[row.status]),
		meta:
			recommended?.computed_total != null
				? moneyText(recommended.computed_total, recommended.currency)
				: `${String(n)} ${n === 1 ? 'option' : 'options'}`
	};
}

/** A bill on this account: what it asked for, and what is still owed on it. */
function relatedInvoice(row: InvoiceWithParties): RelatedRecord {
	const total = moneyText(row.total ?? 0, row.currency);
	const balance = row.balance_due ?? 0;
	return {
		id: row.id,
		name: row.number,
		href: recordHref('invoice', row.id),
		pill:
			row.status === 'issued'
				? pill(row.payment_status, PAYMENT_STATE_TONE[row.payment_status])
				: pill(row.status, INVOICE_STATUS_TONE[row.status]),
		meta:
			row.status === 'issued' && balance > 0
				? `${total} · ${moneyText(balance, row.currency)} due`
				: total
	};
}

function relatedTask(row: Task): RelatedRecord {
	return {
		id: row.id,
		name: row.title,
		href: recordHref('task', row.id),
		pill: pill(TASK_STATUS_LABEL[row.status], TASK_STATUS_TONE[row.status]),
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
 * sidebar lists those kinds. The parties collect other records — a deal, an
 * invoice, a task and a ticket each name a company and a person, so a
 * company or a contact page lists the ones naming it — and a proposal hangs off a
 * company, a contact or a deal through the shared entity link, so those
 * three list their proposals. A group is fetched only when the reader may
 * open that kind (`canOpen`), so nothing is shown that its own list page
 * would refuse, and an empty group is omitted rather than rendered as an
 * empty card.
 */
export async function listRelatedRecords(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: RecordKind,
	id: string,
	canOpen: CanOpen
): Promise<RelatedGroup[]> {
	if (kind !== 'company' && kind !== 'contact' && kind !== 'deal') return [];
	const party =
		kind === 'company' ? { companyId: id } : kind === 'contact' ? { contactId: id } : null;

	const groups = await Promise.all([
		kind === 'company' && canOpen('contact')
			? listContacts(supabase, orgId, party ?? {}).then((rows): RelatedGroup => ({
					kind: 'contact',
					records: rows.map(relatedContact)
				}))
			: null,
		party && canOpen('deal')
			? listDeals(supabase, orgId, party).then((rows): RelatedGroup => ({
					kind: 'deal',
					records: rows.map(relatedDeal)
				}))
			: null,
		canOpen('proposal')
			? listProposals(supabase, orgId, { entity: { entityType: kind, entityId: id } }).then(
					(rows): RelatedGroup => ({ kind: 'proposal', records: rows.map(relatedProposal) })
				)
			: null,
		party && canOpen('invoice')
			? listInvoices(supabase, orgId, party).then((rows): RelatedGroup => ({
					kind: 'invoice',
					records: rows.map(relatedInvoice)
				}))
			: null,
		party && canOpen('task')
			? listTasks(supabase, orgId, party).then((rows): RelatedGroup => ({
					kind: 'task',
					records: rows.map(relatedTask)
				}))
			: null,
		party && canOpen('ticket')
			? listTickets(supabase, orgId, party).then((rows): RelatedGroup => ({
					kind: 'ticket',
					records: rows.map(relatedTicket)
				}))
			: null
	]);

	return groups.filter(
		(group): group is RelatedGroup => group !== null && group.records.length > 0
	);
}
