import type { SupabaseClient } from '@supabase/supabase-js';
import { recordHref } from '$lib/crm/records';
import type { Database } from '$lib/database.types';
import type { CompanyOwnCondition, ContactOwnCondition } from '$lib/views/filter';
import type { ViewDefinition } from '$lib/views/resolve';
import type { ViewPin } from '$lib/views/types';
import type { Address } from './addresses';
import { listCompanies } from './companies';
import { listContacts } from './contacts';
import type { ListResult } from './lists';
import type { CanOpen } from './records';
import { listTaggedEntityIds } from './tags';

/**
 * Running a view: its filter becomes the rows it lists. What the page draws
 * of them is the list's business (`describeListRows()` in lists.ts, over the
 * view's own list_fields rows) — a view is a query with a page, and the page
 * is a list page.
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
 * `pinsFor()` describes the map: pins typed by where they sit, named after
 * their record, linked when `canOpen` says the reader may open the kind.
 */

/** A view's rows: a list result of the kind the view lists. */
export type ViewResult = Extract<ListResult, { kind: 'company' | 'contact' }>;

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
					if (ids.length === 0) return { kind: 'company', rows: [] };
				} else {
					conditions.push(condition);
				}
			}
			const rows = await listCompanies(supabase, orgId, {
				ids,
				conditions,
				sort: view.filter.sort
			});
			return { kind: 'company', rows };
		}
		case 'contact': {
			const conditions: ContactOwnCondition[] = [];
			let ids: string[] | undefined;
			for (const condition of view.filter.where) {
				if (condition.field === 'tag') {
					ids = await narrow(ids, listTaggedEntityIds(supabase, orgId, 'contact', condition.value));
					if (ids.length === 0) return { kind: 'contact', rows: [] };
				} else if (condition.field === 'company.relationship') {
					// The hop: the companies of that relationship, then the people at them.
					const companies = await listCompanies(supabase, orgId, {
						conditions: [{ field: 'relationship', op: condition.op, values: condition.values }]
					});
					if (companies.length === 0) return { kind: 'contact', rows: [] };
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
			return { kind: 'contact', rows };
		}
	}
}

/** Intersect an id list with the one so far — two tag conditions both have to hold. */
async function narrow(sofar: string[] | undefined, next: Promise<string[]>): Promise<string[]> {
	const found = await next;
	return sofar ? found.filter((id) => sofar.includes(id)) : found;
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
	const href = canOpen(result.kind) ? (id: string) => recordHref(result.kind, id) : () => null;
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
