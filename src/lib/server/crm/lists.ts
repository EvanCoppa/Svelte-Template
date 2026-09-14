import type { SupabaseClient } from '@supabase/supabase-js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { couponDiscountText } from '$lib/crm/coupons';
import { leaseName } from '$lib/crm/leases';
import { recordHref, type RecordKind } from '$lib/crm/records';
import {
	ASSET_STATUS_TONE,
	COMPANY_RELATIONSHIP_TONE,
	COUPON_DISCOUNT_TYPE_TONE,
	INVOICE_STATUS_TONE,
	PARTY_STATUS_TONE,
	PRIORITY_TONE,
	PRODUCT_KIND_TONE,
	PROPERTY_STATUS_TONE,
	PROPOSAL_STATUS_TONE,
	FULFILLMENT_STATE_TONE,
	ORDER_STATUS_TONE,
	PURCHASE_STATUS_TONE,
	RMA_STATUS_TONE,
	STAGE_OUTCOME_TONE,
	TICKET_STATUS_TONE
} from '$lib/crm/tones';
import type { Database } from '$lib/database.types';
import {
	ACTIVE_STATUS_TONE,
	LEASE_TERM_TONE,
	isCatalogKey,
	type CatalogKey
} from '$lib/lists/catalog';
import type { ListCell, ListField, ListKind, ListRow, ListSpec } from '$lib/lists/types';
import type { Address } from './addresses';
import { listAssets, type Asset } from './assets';
import { listBillables, type Billable } from './billables';
import { listCompanies, type Company } from './companies';
import { listContacts, type ContactWithCompany } from './contacts';
import { listCoupons, type Coupon } from './coupons';
import type { CustomFieldValue } from './custom-fields';
import { listDeals, type DealWithParties } from './deals';
import { listInvoices, type InvoiceWithParties } from './invoices';
import { listLeases, type LeaseWithParties } from './leases';
import { listProducts, type ProductWithCategory } from './products';
import { listProperties, type Property } from './properties';
import { listProposals, proposalParentKind, type ProposalWithOptions } from './proposals';
import { listOrders, type OrderWithCustomer } from './orders';
import { listPurchases, type PurchaseWithVendor } from './purchases';
import { listRmas, type RmaWithParties } from './rmas';
import { proposalParentKey, type CanOpen, type ProposalParent } from './records';
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
	| { kind: 'property'; rows: Property[] }
	| { kind: 'lease'; rows: LeaseWithParties[] }
	| { kind: 'deal'; rows: DealWithParties[] }
	| { kind: 'ticket'; rows: TicketWithParties[] }
	| { kind: 'invoice'; rows: InvoiceWithParties[] }
	| { kind: 'proposal'; rows: ProposalWithOptions[] }
	| { kind: 'billable'; rows: Billable[] }
	| { kind: 'coupon'; rows: Coupon[] }
	| { kind: 'order'; rows: OrderWithCustomer[] }
	| { kind: 'purchase'; rows: PurchaseWithVendor[] }
	| { kind: 'rma'; rows: RmaWithParties[] };

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
		case 'property':
			return { kind, rows: await listProperties(supabase, orgId) };
		case 'lease':
			return { kind, rows: await listLeases(supabase, orgId) };
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
		case 'coupon':
			return { kind, rows: await listCoupons(supabase, orgId) };
		case 'order':
			return { kind, rows: await listOrders(supabase, orgId) };
		case 'purchase':
			return { kind, rows: await listPurchases(supabase, orgId) };
		case 'rma':
			return { kind, rows: await listRmas(supabase, orgId) };
	}
}

/** Every record's ids, whichever kind the result is. */
export function resultIds(result: ListResult): string[] {
	return result.rows.map((row) => row.id);
}

/**
 * What the describer needs beyond the rows, and only when the spec asks:
 * the records' addresses for a `city` field, their custom values for a
 * custom field, a proposal's parent records for its `contact` field, and
 * the display names behind a proposal's `owner` / `presenter` ids. The load
 * reads exactly these.
 */
export type ListNeeds = {
	addresses: boolean;
	customValues: boolean;
	proposalParents: boolean;
	memberNames: boolean;
};

export function listNeeds(spec: ListSpec): ListNeeds {
	return {
		addresses: spec.fields.some((field) => field.key === 'city'),
		customValues: spec.fields.some((field) => field.custom !== null),
		proposalParents:
			spec.kind === 'proposal' && spec.fields.some((field) => field.key === 'contact'),
		memberNames:
			spec.kind === 'proposal' &&
			spec.fields.some((field) => field.key === 'owner' || field.key === 'presenter')
	};
}

export type ListExtras = {
	addresses: readonly Address[];
	customValues: readonly CustomFieldValue[];
	proposalParents: ReadonlyMap<string, ProposalParent>;
	memberNames: ReadonlyMap<string, string>;
};

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
/** A picture, blank when the record has none: the page draws a placeholder tile. */
const image = (url: string | null): ListCell => ({ type: 'image', url: url?.trim() || null });
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
	const related = (kind: 'company' | 'contact' | 'property', value: Party): ListCell => ({
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
	// The record a proposal hangs off — whichever kind — read from the batch
	// `resolveProposalParents()` fetched; blank for an unattached draft.
	const proposalParent = (
		row: Pick<ProposalWithOptions, 'entity_type' | 'entity_id'>
	): ProposalParent | null => {
		const kind = proposalParentKind(row.entity_type);
		if (kind === null || row.entity_id === null) return null;
		return extras.proposalParents.get(proposalParentKey(kind, row.entity_id)) ?? null;
	};
	const memberName = (userId: string | null): string | undefined =>
		userId ? extras.memberNames.get(userId) : undefined;

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
						return related('company', contact.companies);
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
		case 'property': {
			// Buildings and units are one table and the list is the whole of
			// it, so the parent's name is already in hand — no second read.
			const nameOf = new Map(result.rows.map((row) => [row.id, row.name]));
			return describe(result.kind, result.rows, (property, key) => {
				switch (key) {
					case 'name':
						return link('property', property.id, property.name);
					case 'parent':
						return related(
							'property',
							property.parent_id
								? { id: property.parent_id, name: nameOf.get(property.parent_id) ?? '' }
								: null
						);
					case 'property_type':
						return text(property.property_type);
					case 'identifier':
						return text(property.identifier);
					case 'status':
						return status(property.status, PROPERTY_STATUS_TONE[property.status]);
					case 'bedrooms':
						return number(property.bedrooms);
					case 'bathrooms':
						return number(property.bathrooms);
					case 'square_feet':
						return number(property.square_feet);
					case 'market_rent':
						return money(property.market_rent, property.currency);
					case 'acquired_on':
						return date(property.acquired_on);
					case 'purchase_price':
						return money(property.purchase_price, property.currency);
					case 'created_at':
						return datetime(property.created_at);
				}
			});
		}
		case 'lease':
			return describe(result.kind, result.rows, (lease, key) => {
				const tenant = lease.contacts ?? lease.companies;
				switch (key) {
					case 'name':
						return link(
							'lease',
							lease.id,
							leaseName({ property: lease.properties?.name, tenant: tenant?.name })
						);
					case 'property':
						return related('property', lease.properties);
					case 'tenant':
						return related(lease.contacts ? 'contact' : 'company', tenant);
					// The stored half of a tenancy's shape. Whether it is
					// RUNNING is a question about the viewer's date, so it is
					// not a column here — see the catalog.
					case 'term':
						return status(
							lease.ends_on === null ? 'month-to-month' : 'fixed term',
							LEASE_TERM_TONE[lease.ends_on === null ? 'month-to-month' : 'fixed term']
						);
					case 'starts_on':
						return date(lease.starts_on);
					case 'ends_on':
						return date(lease.ends_on);
					case 'rent_amount':
						return money(lease.rent_amount, lease.currency);
					case 'rent_due_day':
						return number(lease.rent_due_day);
					case 'security_deposit':
						return money(lease.security_deposit, lease.currency);
					case 'created_at':
						return datetime(lease.created_at);
				}
			});
		case 'product':
			return describe(result.kind, result.rows, (product, key) => {
				switch (key) {
					case 'name':
						return link('product', product.id, product.name);
					case 'image':
						return image(product.image_url);
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
						return related('company', deal.companies);
					case 'contact':
						return related('contact', deal.contacts);
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
						return related('company', ticket.companies);
					case 'contact':
						return related('contact', ticket.contacts);
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
						return related('company', invoice.companies);
					case 'contact':
						return related('contact', invoice.contacts);
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
					case 'contact': {
						const parent = proposalParent(proposal);
						return {
							type: 'record',
							text: parent?.name ?? '',
							href: parent && canOpen(parent.kind) ? recordHref(parent.kind, parent.id) : null
						};
					}
					case 'owner':
						return text(memberName(proposal.responsible_id));
					case 'presenter':
						return text(memberName(proposal.presenter_id));
					case 'status':
						return status(proposal.status, PROPOSAL_STATUS_TONE[proposal.status]);
					case 'value': {
						// What a client actually chose; blank until they have (a draft
						// or sent proposal has no `selected_option_id` yet).
						const selected = proposal.proposal_options.find(
							(option) => option.id === proposal.selected_option_id
						);
						return money(selected?.computed_total ?? null, selected?.currency ?? 'USD');
					}
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
						return status(word, ACTIVE_STATUS_TONE[word]);
					}
					case 'created_at':
						return datetime(billable.created_at);
				}
			});
		case 'coupon':
			return describe(result.kind, result.rows, (coupon, key) => {
				switch (key) {
					case 'name':
						return link('coupon', coupon.id, coupon.code);
					case 'discount_type':
						return status(coupon.discount_type, COUPON_DISCOUNT_TYPE_TONE[coupon.discount_type]);
					case 'discount':
						// Read against the type, in one place (`$lib/crm/coupons`), so the
						// list and the record page say the same thing.
						return text(couponDiscountText(coupon));
					case 'starts_on':
						return date(coupon.starts_on);
					case 'ends_on':
						return date(coupon.ends_on);
					case 'status': {
						const word = coupon.is_active ? 'active' : 'inactive';
						return status(word, ACTIVE_STATUS_TONE[word]);
					}
					case 'description':
						return text(coupon.description);
					case 'created_at':
						return datetime(coupon.created_at);
				}
			});
		case 'order':
			return describe(result.kind, result.rows, (order, key) => {
				switch (key) {
					case 'name':
						return link('order', order.id, order.number);
					case 'company':
						return related('company', order.companies);
					case 'contact':
						return related('contact', order.contacts);
					case 'status':
						return status(order.status, ORDER_STATUS_TONE[order.status]);
					case 'fulfillment_status':
						// Folded from the lines by the database, never typed.
						return status(
							order.fulfillment_status,
							FULFILLMENT_STATE_TONE[order.fulfillment_status]
						);
					case 'customer_po':
						return text(order.customer_po);
					case 'total':
						// Generated from the lines, the shipping and the discount.
						return money(order.total ?? 0, order.currency);
					case 'estimated_ship_date':
						return date(order.estimated_ship_date);
					case 'confirmed_at':
						return datetime(order.confirmed_at);
					case 'created_at':
						return datetime(order.created_at);
				}
			});
		case 'purchase':
			return describe(result.kind, result.rows, (purchase, key) => {
				switch (key) {
					case 'name':
						return link('purchase', purchase.id, purchase.number);
					case 'company':
						return related('company', purchase.companies);
					case 'status':
						return status(purchase.status, PURCHASE_STATUS_TONE[purchase.status]);
					case 'reference':
						return text(purchase.reference);
					case 'total':
						// Generated from the lines, the freight and the fee; never typed.
						return money(purchase.total ?? 0, purchase.currency);
					case 'expected_at':
						return datetime(purchase.expected_at);
					case 'ordered_at':
						return datetime(purchase.ordered_at);
					case 'created_at':
						return datetime(purchase.created_at);
				}
			});
		case 'rma':
			return describe(result.kind, result.rows, (rma, key) => {
				switch (key) {
					case 'name':
						return link('rma', rma.id, rma.number);
					case 'company':
						return related('company', rma.companies);
					case 'contact':
						return related('contact', rma.contacts);
					case 'status':
						return status(rma.status, RMA_STATUS_TONE[rma.status]);
					case 'requested_on':
						return date(rma.requested_on);
					case 'reason':
						return text(rma.reason);
					case 'resolution':
						return text(rma.resolution);
					case 'created_at':
						return datetime(rma.created_at);
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
