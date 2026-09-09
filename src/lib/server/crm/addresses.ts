import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityRef, CrmEntityType } from './entity';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `addresses` — where a party is. A company or a contact can
 * have several (billing, shipping, the job sites), and `is_primary` picks the
 * one a record header shows first. Same contract as companies.ts; the
 * database refuses an address on anything but a party.
 *
 * Writes follow the companies.ts pattern: params Picked to the columns the
 * party-model migration grants the browser (`entity_type` / `entity_id` are
 * insert-only there — moving an address is a delete and a create). The
 * coordinates are among them: the record page's address action fills them
 * in from `geocode()` (`$lib/server/geocode`) before it writes.
 */

export type Address = Tables<'addresses'>;

type AddressColumn =
	| 'kind'
	| 'label'
	| 'line1'
	| 'line2'
	| 'city'
	| 'region'
	| 'postal_code'
	| 'country'
	| 'latitude'
	| 'longitude'
	| 'is_primary';

/** A party's addresses, the primary one first, then oldest first. */
export async function listAddresses(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef
): Promise<Address[]> {
	return unwrap(
		await supabase
			.from('addresses')
			.select('*')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.order('is_primary', { ascending: false })
			.order('created_at')
	);
}

/**
 * The addresses of many records of one kind in one read — what a view
 * needs to pin its rows on a map and show each one's city. Primary first
 * within a record, so the first address seen for a record is the one its
 * header shows. Nothing to look up is nothing to fetch.
 */
export async function listAddressesFor(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entityType: CrmEntityType,
	entityIds: readonly string[]
): Promise<Address[]> {
	if (entityIds.length === 0) return [];
	return unwrap(
		await supabase
			.from('addresses')
			.select('*')
			.eq('org_id', orgId)
			.eq('entity_type', entityType)
			.in('entity_id', [...entityIds])
			.order('is_primary', { ascending: false })
			.order('created_at')
	);
}

/**
 * Only one address per party may be primary (a partial unique index), so
 * making one primary first demotes the rest. Done here rather than in the
 * form so no caller sees the 23505.
 */
async function clearPrimary(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef
): Promise<void> {
	ensure(
		await supabase
			.from('addresses')
			.update({ is_primary: false })
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.eq('is_primary', true)
	);
}

export async function createAddress(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	values: Pick<TablesInsert<'addresses'>, AddressColumn>
): Promise<Address> {
	if (values.is_primary) await clearPrimary(supabase, orgId, entity);
	return unwrap(
		await supabase
			.from('addresses')
			.insert({
				...values,
				org_id: orgId,
				entity_type: entity.entityType,
				entity_id: entity.entityId
			})
			.select()
			.single()
	);
}

export async function updateAddress(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	addressId: string,
	values: Pick<TablesUpdate<'addresses'>, AddressColumn>
): Promise<Address> {
	if (values.is_primary) await clearPrimary(supabase, orgId, entity);
	return unwrap(
		await supabase
			.from('addresses')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', addressId)
			.select()
			.single()
	);
}

export async function deleteAddress(
	supabase: SupabaseClient<Database>,
	orgId: string,
	addressId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('addresses').delete().eq('org_id', orgId).eq('id', addressId).select('id'),
		'Address'
	);
}
