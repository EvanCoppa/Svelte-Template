import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * Data access for `addresses` — where a party is. A company or a contact can
 * have several (billing, shipping, the job sites), and `is_primary` picks the
 * one a record header shows first. Same contract as companies.ts; the
 * database refuses an address on anything but a party.
 *
 * Reads only, for now; writes follow the companies.ts pattern when a form
 * needs them.
 */

export type Address = Tables<'addresses'>;

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
