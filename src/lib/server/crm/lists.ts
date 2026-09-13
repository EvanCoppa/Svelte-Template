import type { SupabaseClient } from '@supabase/supabase-js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { recommendedOption } from '$lib/crm/proposals';
import { recordHref, type RecordKind } from '$lib/crm/records';
import {
	ASSET_STATUS_TONE,
	COMPANY_RELATIONSHIP_TONE,
	INVOICE_STATUS_TONE,
	PARTY_STATUS_TONE,
	PRIORITY_TONE,
	PRODUCT_KIND_TONE,
	PROPOSAL_STATUS_TONE,
	STAGE_OUTCOME_TONE,
	TICKET_STATUS_TONE
} from '$lib/crm/tones';
import type { Database } from '$lib/database.types';
import { BILLABLE_STATUS_TONE, isCatalogKey, type CatalogKey } from '$lib/lists/catalog';
import type { ListCell, ListField, ListKind, ListRow, ListSpec } from '$lib/lists/types';
import { getDisplayNames } from '../profiles';
import type { Address } from './addresses';
import { listAssets, type Asset } from './assets';
import { listBillables, type Billable } from './billables';
import { listCompanies, type Company } from './companies';
import { listContacts, type ContactWithCompany } from './contacts';
import type { CustomFieldValue } from './custom-fields';
import { listDeals, type DealWithParties } from './deals';
import type { CrmEntityType } from './entity';
import { listInvoices, type InvoiceWithParties } from './invoices';
import { listProducts, type ProductWithCategory } from './products';
import { listProposals, type ProposalWithOptions } from './proposals';
import type { CanOpen } from './records';
import { listRelationshipsFrom, RELATIONSHIP_TYPE } from './relationships';
import { listTickets, type TicketWithParties } from './tickets';

/**
 * Reading a kind's rows as a list: the rows every list page shows, and
 * what the page draws of them.
 *
 * `listRecords()` is one branch per kind onto the kind's own list module —
 * the modules stay the one way to read a table. `describeListRows()` is the
 * describer: the page never sees a `Company`, only cells typed by how they
 * render (the record page's `RecordDetail` rule), one per field of the spec
 * the industry resolved. A built-in field is a switch on the kind's catalog
 * key, so a key the catalog has and this cannot fill is a `check` error; a
 * custom field is read from the values fetched for the rows. `canOpen`
 * decides whether a name links — the gate the hook enforces, so a view of
 * vendors still renders when the org switched Companies off, with plain
 * names.
 */

export type ListResult =
	| { kind: 'company'; rows: Company[] }
	| { kind: 'contact'; rows: ContactWithCompany[] }
	| { kind: 'asset'; rows: Asset[] }
	| { kind: 'product'; rows: ProductWithCategory[] }
	| { kind: 'deal'; rows: DealWithParties[] }
	| { kind: 'ticket'; rows: TicketWithParties[] }
	| { kind: 'invoice'; rows: InvoiceWithParties[] }
	| { kind: 'proposal'; rows: ProposalWithOptions[] }
	| { kind: 'billable'; rows: Billable[] };

/** Every row of the kind the org has — a kind's own list page. */
export async function listRecords(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: ListKind
): Promise<ListResult> {
	switch (kind) {
		case 'company':
			return { kind, rows: await listCompanies(supabase, orgId) };
		case 'contact':
			return { kind, rows: await listContacts(supabase, orgId) };
		case 'asset':
			return { kind, rows: await listAssets(supabase, orgId) };
		case 'product':
			return { kind, rows: await listProducts(supabase, orgId) };
		case 'deal':
			return { kind, rows: await listDeals(supabase, orgId) };
		case 'ticket':
			return { kind, rows: await listTickets(supabase, orgId) };
		case 'invoice':
			return { kind, rows: await listInvoices(supabase, orgId) };
		case 'proposal':
			return { kind, rows: await listProposals(supabase, orgId) };
		case 'billable':
			return { kind, rows: await listBillables(supabase, orgId) };
	}
}

/** Every record's ids, whichever kind the result is. */
export function resultIds(result: ListResult): string[] {
	return result.rows.map((row) => row.id);
}

/**
 * What the describer needs beyond the rows, and only when the spec asks:
 * the records' addresses for a `city` field, their custom values for a
 * custom field. The load reads exactly these.
 */
export type ListNeeds = { addresses: boolean; customValues: boolean; assignees: boolean };

export function listNeeds(spec: ListSpec): ListNeeds {
	return {
		addresses: spec.fields.some((field) => field.key === 'city'),
		customValues: spec.fields.some((field) => field.custom !== null),
		assignees: spec.fields.some((field) => field.type === 'person')
	};
}

export type ListExtras = {
	addresses: readonly Address[];
	customValues: readonly CustomFieldValue[];
	assignees: ReadonlyMap<string, { userId: string; name: string }>;
};

/**
 * Who each record is assigned to — the `assigned_to` relationship
 * (`RELATIONSHIP_TYPE.assignedTo`), not a column, so the graph and a list's
 * "Assigned to" column read the same rows. One query for every row of a
 * page (`listRelationshipsFrom()`), plus one naming the assigned members
 * (`getDisplayNames()`, the way `getRelationships()` names a related
 * member); an id with no open assignment, or whose relationship points
 * somewhere other than a member, has no entry.
 */
export async function listAssignedMembers(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entityType: CrmEntityType,
	entityIds: readonly string[]
): Promise<ReadonlyMap<string, { userId: string; name: string }>> {
	const rows = await listRelationshipsFrom(supabase, orgId, entityType, entityIds, {
		typeId: RELATIONSHIP_TYPE.assignedTo,
		openOnly: true
	});

	// Newest first (`listRelationshipsFrom()`'s order): keep only the most
	// recent assignment per record.
	const memberIdByRecord = new Map<string, string>();
	for (const row of rows) {
		if (row.to_type === 'member' && !memberIdByRecord.has(row.from_id)) {
			memberIdByRecord.set(row.from_id, row.to_id);
		}
	}

	const people = await getDisplayNames(supabase, [...memberIdByRecord.values()]);
	const assignees = new Map<string, { userId: string; name: string }>();
	for (const [recordId, userId] of memberIdByRecord) {
		const name = people.get(userId);
		if (name) assignees.set(recordId, { userId, name });
	}
	return assignees;
}

/** The first address listed for each record — the primary one, the way `listAddressesFor()` orders them. */
function firstAddressByRecord(addresses: readonly Address[]): Map<string, Address> {
	const first = new Map<string, Address>();
	for (const address of addresses) {
		if (!first.has(address.entity_id)) first.set(address.entity_id, address);
	}
	return first;
}

const text = (value: string | null | undefined): ListCell => ({
	type: 'text',
	text: value?.trim() ?? ''
});
const money = (value: number | null, currency: string, unit: string | null = null): ListCell => ({
	type: 'money',
	value,
	currency,
	unit
});
const date = (value: string | null): ListCell => ({ type: 'date', value });
const datetime = (value: string | null): ListCell => ({ type: 'datetime', value });
const number = (value: number | null): ListCell => ({ type: 'number', value });

type Party = { id: string; name: string } | null;

export function describeListRows(
	result: ListResult,
	spec: ListSpec,
	canOpen: CanOpen,
	extras: ListExtras
): ListRow[] {
	const cityOf = firstAddressByRecord(extras.addresses);
	const link = (kind: RecordKind, id: string, name: string): ListCell => ({
		type: 'link',
		text: name,
		href: canOpen(kind) ? recordHref(kind, id) : null
	});
	const party = (kind: 'company' | 'contact', value: Party): ListCell => ({
		type: 'record',
		text: value?.name ?? '',
		href: value && canOpen(kind) ? recordHref(kind, value.id) : null
	});
	const status = (value: string, tone: BadgeTone): ListCell => ({
		type: 'status',
		text: value,
		tone
	});
	const custom = customValueReader(extras.customValues);

	// Each kind's cell for one of its catalog keys. The switch is on the
	// result and the spec together: a spec of companies can only ever have
	// run to companies, so the pairing is total and a mismatch is empty, not a
	// cast.
	const describe = <K extends ListKind, R extends { id: string }>(
		kind: K,
		rows: readonly R[],
		cell: (row: R, key: CatalogKey<K>) => ListCell
	): ListRow[] => {
		if (spec.kind !== kind) return [];
		return rows.map((row) => ({
			id: row.id,
			cells: spec.fields.map((field) => {
				if (field.custom) return custom(row.id, field);
				if (isCatalogKey(kind, field.key)) return cell(row, field.key);
				// Unreachable: the resolver refused every key the catalog lacks.
				throw new Error(`No cell for ${kind} field ${field.key}.`);
			})
		}));
	};

	switch (result.kind) {
		case 'company':
			return describe(result.kind, result.rows, (company, key) => {
				switch (key) {
					case 'name':
						return link('company', company.id, company.name);
					case 'relationship':
						return status(company.relationship, COMPANY_RELATIONSHIP_TONE[company.relationship]);
					case 'status':
						return status(company.status, PARTY_STATUS_TONE[company.status]);
					case 'email':
						return text(company.email);
					case 'phone':
						return text(company.phone);
					case 'website':
						return text(company.website);
					case 'city':
						return text(cityOf.get(company.id)?.city);
					case 'assigned_to': {
						const assignee = extras.assignees.get(company.id);
						return {
							type: 'person',
							userId: assignee?.userId ?? null,
							name: assignee?.name ?? null
						};
					}
					case 'created_at':
						return datetime(company.created_at);
				}
			});
		case 'contact':
			return describe(result.kind, result.rows, (contact, key) => {
				switch (key) {
					case 'name':
						return link('contact', contact.id, contact.name);
					case 'company':
						return party('company', contact.companies);
					case 'title':
						return text(contact.title);
					case 'email':
						return text(contact.email);
					case 'phone':
						return text(contact.phone);
					case 'status':
						return status(contact.status, PARTY_STATUS_TONE[contact.status]);
					case 'city':
						return text(cityOf.get(contact.id)?.city);
					case 'created_at':
						return datetime(contact.created_at);
				}
			});
		case 'asset':
			return describe(result.kind, result.rows, (asset, key) => {
				switch (key) {
					case 'name':
						return link('asset', asset.id, asset.name);
					case 'asset_type':
						return text(asset.asset_type);
					case 'identifier':
						return text(asset.identifier);
					case 'status':
						return status(asset.status, ASSET_STATUS_TONE[asset.status]);
					case 'acquired_on':
						return date(asset.acquired_on);
					case 'disposed_on':
						return date(asset.disposed_on);
					case 'purchase_price':
						// An asset carries its own currency; the page formats in it.
						return money(asset.purchase_price, asset.currency);
					case 'created_at':
						return datetime(asset.created_at);
				}
			});
		case 'product':
			return describe(result.kind, result.rows, (product, key) => {
				switch (key) {
					case 'name':
						return link('product', product.id, product.name);
					case 'kind':
						return status(product.kind, PRODUCT_KIND_TONE[product.kind]);
					case 'category':
						return text(product.product_categories?.name);
					case 'sku':
						return text(product.sku);
					case 'unit_price':
						return money(product.unit_price, product.currency, product.unit);
					case 'quantity_on_hand':
						// Only goods carry stock, so a service reads as blank rather
						// than a misleading zero.
						return number(product.track_inventory ? (product.quantity_on_hand ?? 0) : null);
					case 'created_at':
						return datetime(product.created_at);
				}
			});
		case 'deal':
			return describe(result.kind, result.rows, (deal, key) => {
				switch (key) {
					case 'name':
						return link('deal', deal.id, deal.title);
					case 'company':
						return party('company', deal.companies);
					case 'contact':
						return party('contact', deal.contacts);
					case 'stage':
						return status(
							deal.pipeline_stages.name,
							STAGE_OUTCOME_TONE[deal.pipeline_stages.outcome]
						);
					case 'amount':
						return money(deal.amount, 'USD');
					case 'expected_close_date':
						return date(deal.expected_close_date);
					case 'created_at':
						return datetime(deal.created_at);
				}
			});
		case 'ticket':
			return describe(result.kind, result.rows, (ticket, key) => {
				switch (key) {
					case 'number':
						return number(ticket.number);
					case 'name':
						return link('ticket', ticket.id, ticket.subject);
					case 'company':
						return party('company', ticket.companies);
					case 'contact':
						return party('contact', ticket.contacts);
					case 'status':
						return status(ticket.status, TICKET_STATUS_TONE[ticket.status]);
					case 'priority':
						return status(ticket.priority, PRIORITY_TONE[ticket.priority]);
					case 'created_at':
						return datetime(ticket.created_at);
				}
			});
		case 'invoice':
			return describe(result.kind, result.rows, (invoice, key) => {
				switch (key) {
					case 'name':
						return link('invoice', invoice.id, invoice.number);
					case 'company':
						return party('company', invoice.companies);
					case 'contact':
						return party('contact', invoice.contacts);
					case 'status':
						return status(invoice.status, INVOICE_STATUS_TONE[invoice.status]);
					case 'payment':
						// A draft or a void invoice has no money state; the browser
						// says "overdue" from its own date (docs/ledger.md).
						return {
							type: 'payment',
							state: invoice.status === 'issued' ? invoice.payment_status : null,
							dueDate: invoice.due_date,
							owed: (invoice.balance_due ?? 0) > 0
						};
					case 'total':
						return money(invoice.total ?? 0, invoice.currency);
					case 'balance':
						return money(
							invoice.status === 'issued' ? (invoice.balance_due ?? 0) : null,
							invoice.currency
						);
					case 'due_date':
						return date(invoice.due_date);
					case 'created_at':
						return datetime(invoice.created_at);
				}
			});
		case 'proposal':
			return describe(result.kind, result.rows, (proposal, key) => {
				switch (key) {
					case 'name':
						return link('proposal', proposal.id, proposal.title);
					case 'status':
						return status(proposal.status, PROPOSAL_STATUS_TONE[proposal.status]);
					case 'options':
						return number(proposal.proposal_options.length);
					case 'recommended': {
						// The figure a client is steered to; a proposal with no
						// recommended option (or one not yet priced) shows nothing.
						const option = recommendedOption(proposal.proposal_options);
						return money(option?.computed_total ?? null, option?.currency ?? 'USD');
					}
					case 'valid_until':
						return datetime(proposal.valid_until);
					case 'created_at':
						return datetime(proposal.created_at);
				}
			});
		case 'billable':
			return describe(result.kind, result.rows, (billable, key) => {
				switch (key) {
					case 'name':
						return link('billable', billable.id, billable.name);
					case 'code':
						return text(billable.code);
					case 'unit_price':
						return money(billable.unit_price, billable.currency, billable.unit);
					case 'unit_choices':
						// The chips the builder offers; blank means the units are typed in.
						return text(billable.unit_choices?.join(', '));
					case 'is_featured':
						return { type: 'boolean', value: billable.is_featured };
					case 'status': {
						const word = billable.is_active ? 'active' : 'inactive';
						return status(word, BILLABLE_STATUS_TONE[word]);
					}
					case 'created_at':
						return datetime(billable.created_at);
				}
			});
	}
}

/**
 * The cell a record holds for a custom field: the value in the column that
 * matches the definition's type, blank when the record has none. Keyed by
 * (record, definition) once, so a list of a thousand rows does not scan the
 * values a thousand times.
 */
function customValueReader(
	values: readonly CustomFieldValue[]
): (recordId: string, field: ListField) => ListCell {
	const byRecordAndField = new Map(
		values.map((value) => [`${value.entity_id}:${value.field_definition_id}`, value])
	);
	return (recordId, field) => {
		// SAFETY: only called for a field the resolver marked custom.
		const custom = field.custom;
		if (!custom) throw new Error(`${field.key} is not a custom field.`);
		const value = byRecordAndField.get(`${recordId}:${custom.definitionId}`);
		switch (custom.valueType) {
			case 'text':
			case 'select':
				return text(value?.value_text);
			case 'numeric':
				return number(value?.value_numeric ?? null);
			case 'boolean':
				return { type: 'boolean', value: value?.value_boolean ?? null };
		}
	};
}
