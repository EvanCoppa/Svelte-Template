import type { SupabaseClient } from '@supabase/supabase-js';
import { recordHref, type RecordKind } from '$lib/crm/records';
import { COMPANY_RELATIONSHIP_TONE, PARTY_STATUS_TONE } from '$lib/crm/tones';
import type { Database } from '$lib/database.types';
import type { CompanyOwnCondition, ContactOwnCondition } from '$lib/views/filter';
import type { CompanyColumnKey, ContactColumnKey, ViewCell, ViewRow } from '$lib/views/columns';
import type { ViewDefinition } from '$lib/views/resolve';
import type { ViewPin } from '$lib/views/types';
import type { Address } from './addresses';
import { listCompanies, type Company } from './companies';
import { listContacts, type ContactWithCompany } from './contacts';
import type { CanOpen } from './records';
import { listTaggedEntityIds } from './tags';

/**
 * Running a view: its filter becomes the rows it lists, and the rows become
 * what the page draws.
 *
 * `runView()` is the compiler. A view's own-column conditions go straight
 * into the source's list module (`conditions` on `listCompanies()` /
 * `listContacts()` — the modules stay the one way to read a table). The two
 * conditions that reach past the record's own table resolve to an id list
 * FIRST — a tag to the ids that carry it, a contact's company's
 * relationship to the companies that have it — and an empty list ends the
 * run with no rows and no second query. Two round trips is the price of not
 * changing every caller's select for an `!inner` embed; the day an org has
 * tens of thousands of tagged records the id list outgrows a query string,
 * and an RPC replaces this — nothing above it changes.
 *
 * `describeViewRows()` and `pinsFor()` are the describers: the page never
 * sees a `Company`, only cells typed by how they render (the record page's
 * `RecordDetail` rule) and pins typed by where they sit. `canOpen` decides
 * whether the name links — the gate the hook enforces, so a view of vendors
 * still renders when the org switched Companies off, with plain names.
 */

export type ViewResult =
	{ source: 'company'; rows: Company[] } | { source: 'contact'; rows: ContactWithCompany[] };

export async function runView(
	supabase: SupabaseClient<Database>,
	orgId: string,
	view: ViewDefinition
): Promise<ViewResult> {
	switch (view.source) {
		case 'company': {
			const conditions: CompanyOwnCondition[] = [];
			let ids: string[] | undefined;
			for (const condition of view.filter.where) {
				if (condition.field === 'tag') {
					ids = await narrow(ids, listTaggedEntityIds(supabase, orgId, 'company', condition.value));
					if (ids.length === 0) return { source: 'company', rows: [] };
				} else {
					conditions.push(condition);
				}
			}
			const rows = await listCompanies(supabase, orgId, {
				ids,
				conditions,
				sort: view.filter.sort
			});
			return { source: 'company', rows };
		}
		case 'contact': {
			const conditions: ContactOwnCondition[] = [];
			let ids: string[] | undefined;
			for (const condition of view.filter.where) {
				if (condition.field === 'tag') {
					ids = await narrow(ids, listTaggedEntityIds(supabase, orgId, 'contact', condition.value));
					if (ids.length === 0) return { source: 'contact', rows: [] };
				} else if (condition.field === 'company.relationship') {
					// The hop: the companies of that relationship, then the people at them.
					const companies = await listCompanies(supabase, orgId, {
						conditions: [{ field: 'relationship', op: condition.op, values: condition.values }]
					});
					if (companies.length === 0) return { source: 'contact', rows: [] };
					conditions.push({
						field: 'company_id',
						op: 'in',
						values: companies.map((company) => company.id)
					});
				} else {
					conditions.push(condition);
				}
			}
			const rows = await listContacts(supabase, orgId, {
				ids,
				conditions,
				sort: view.filter.sort
			});
			return { source: 'contact', rows };
		}
	}
}

/** Intersect an id list with the one so far — two tag conditions both have to hold. */
async function narrow(sofar: string[] | undefined, next: Promise<string[]>): Promise<string[]> {
	const found = await next;
	return sofar ? found.filter((id) => sofar.includes(id)) : found;
}

/** Every record's ids, whichever kind the result is. */
export function resultIds(result: ViewResult): string[] {
	return result.rows.map((row) => row.id);
}

/** The first address listed for each record — the primary one, the way `listAddressesFor()` orders them. */
function firstAddressByRecord(addresses: readonly Address[]): Map<string, Address> {
	const first = new Map<string, Address>();
	for (const address of addresses) {
		if (!first.has(address.entity_id)) first.set(address.entity_id, address);
	}
	return first;
}

const text = (value: string | null): ViewCell => ({ type: 'text', text: value?.trim() ?? '' });

export function describeViewRows(
	result: ViewResult,
	view: ViewDefinition,
	canOpen: CanOpen,
	addresses: readonly Address[]
): ViewRow[] {
	const cityOf = firstAddressByRecord(addresses);
	const link = (kind: RecordKind, id: string, name: string): ViewCell => ({
		type: 'link',
		text: name,
		href: canOpen(kind) ? recordHref(kind, id) : null
	});

	// The switch is on the result and the view together: a view of companies
	// can only ever have run to companies, so the pairing is total and the
	// other branch is unreachable, not a cast.
	switch (result.source) {
		case 'company': {
			if (view.source !== 'company') return [];
			const cell = (company: Company, key: CompanyColumnKey): ViewCell => {
				switch (key) {
					case 'name':
						return link('company', company.id, company.name);
					case 'relationship':
						return {
							type: 'status',
							text: company.relationship,
							tone: COMPANY_RELATIONSHIP_TONE[company.relationship]
						};
					case 'status':
						return {
							type: 'status',
							text: company.status,
							tone: PARTY_STATUS_TONE[company.status]
						};
					case 'email':
						return text(company.email);
					case 'phone':
						return text(company.phone);
					case 'website':
						return text(company.website);
					case 'city':
						return text(cityOf.get(company.id)?.city ?? null);
					case 'created_at':
						return { type: 'datetime', text: company.created_at };
				}
			};
			return result.rows.map((company) => ({
				id: company.id,
				cells: view.columns.map((key) => cell(company, key))
			}));
		}
		case 'contact': {
			if (view.source !== 'contact') return [];
			const cell = (contact: ContactWithCompany, key: ContactColumnKey): ViewCell => {
				switch (key) {
					case 'name':
						return link('contact', contact.id, contact.name);
					case 'company':
						return contact.companies
							? link('company', contact.companies.id, contact.companies.name)
							: text(null);
					case 'title':
						return text(contact.title);
					case 'email':
						return text(contact.email);
					case 'phone':
						return text(contact.phone);
					case 'status':
						return {
							type: 'status',
							text: contact.status,
							tone: PARTY_STATUS_TONE[contact.status]
						};
					case 'city':
						return text(cityOf.get(contact.id)?.city ?? null);
					case 'created_at':
						return { type: 'datetime', text: contact.created_at };
				}
			};
			return result.rows.map((contact) => ({
				id: contact.id,
				cells: view.columns.map((key) => cell(contact, key))
			}));
		}
	}
}

/**
 * One pin per address that has both coordinates, named after its record.
 * An address with no coordinates yet (nothing geocoded it) is simply not on
 * the map; the table still lists the record.
 */
export function pinsFor(
	result: ViewResult,
	canOpen: CanOpen,
	addresses: readonly Address[]
): ViewPin[] {
	const names = new Map(result.rows.map((row) => [row.id, row.name]));
	const href = canOpen(result.source) ? (id: string) => recordHref(result.source, id) : () => null;
	const pins: ViewPin[] = [];
	for (const address of addresses) {
		const label = names.get(address.entity_id);
		if (label === undefined || address.latitude === null || address.longitude === null) continue;
		pins.push({
			id: address.id,
			recordId: address.entity_id,
			label,
			href: href(address.entity_id),
			latitude: address.latitude,
			longitude: address.longitude
		});
	}
	return pins;
}
