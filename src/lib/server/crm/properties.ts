import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `properties` — the portfolio. One table holds both levels:
 * a building is a row with no parent, and a unit inside it is a row whose
 * `parent_id` names that building (the properties_and_leases migration,
 * decision 1). A single-family is one row that is both.
 *
 * Depth is capped at two by the database, which is what lets anything roll a
 * unit up to the building that carries its mortgage with `buildingIdOf()`
 * below rather than a recursive query.
 *
 * Same contract as assets.ts: request-scoped client + active org id, write
 * params Picked to the columns the migration grants, `created_by` filled by
 * the database, deletes gated to owner/admin by RLS and verified by
 * `unwrapDeleted`.
 */

export type Property = Tables<'properties'>;

type PropertyColumn =
	| 'parent_id'
	| 'name'
	| 'property_type'
	| 'identifier'
	| 'status'
	| 'description'
	| 'bedrooms'
	| 'bathrooms'
	| 'square_feet'
	| 'market_rent'
	| 'acquired_on'
	| 'disposed_on'
	| 'purchase_price'
	| 'currency';

/**
 * The building a row belongs to: itself when it is one. The pure half of the
 * depth-two cap — the same `coalesce(parent_id, id)` the migration's reports
 * use, so app code never reconstructs the rule.
 */
export function buildingIdOf(row: Pick<Property, 'id' | 'parent_id'>): string {
	return row.parent_id ?? row.id;
}

/** Whether this row is a rentable unit inside a building rather than the building. */
export function isUnit(row: Pick<Property, 'parent_id'>): boolean {
	return row.parent_id !== null;
}

/**
 * The org's properties, buildings before their units and each group by name —
 * the list page's order, which is also the order a portfolio reads in.
 */
export async function listProperties(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { status?: Property['status']; parentId?: string | null } = {}
): Promise<Property[]> {
	let query = supabase
		.from('properties')
		.select('*')
		.eq('org_id', orgId)
		.order('status')
		.order('name');
	if (filter.status) query = query.eq('status', filter.status);
	// `null` is a real filter here — "the buildings" — so check for undefined
	// rather than falsiness.
	if (filter.parentId !== undefined) {
		query =
			filter.parentId === null
				? query.is('parent_id', null)
				: query.eq('parent_id', filter.parentId);
	}
	return unwrap(await query);
}

/** The units inside one building, by name. Empty for a single-family. */
export async function listUnits(
	supabase: SupabaseClient<Database>,
	orgId: string,
	buildingId: string
): Promise<Property[]> {
	return listProperties(supabase, orgId, { parentId: buildingId });
}

export async function getProperty(
	supabase: SupabaseClient<Database>,
	orgId: string,
	propertyId: string
): Promise<Property | null> {
	return unwrap(
		await supabase
			.from('properties')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', propertyId)
			.maybeSingle()
	);
}

export async function createProperty(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'properties'>, PropertyColumn>
): Promise<Property> {
	return unwrap(
		await supabase
			.from('properties')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateProperty(
	supabase: SupabaseClient<Database>,
	orgId: string,
	propertyId: string,
	values: Pick<TablesUpdate<'properties'>, PropertyColumn>
): Promise<Property> {
	return unwrap(
		await supabase
			.from('properties')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', propertyId)
			.select()
			.single()
	);
}

export async function deleteProperty(
	supabase: SupabaseClient<Database>,
	orgId: string,
	propertyId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('properties')
			.delete()
			.eq('org_id', orgId)
			.eq('id', propertyId)
			.select('id'),
		'Property'
	);
}
