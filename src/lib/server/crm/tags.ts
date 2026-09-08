import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * Data access for `tags` and `taggings` — the org's labels and where they are
 * applied. A tag lands on any CRM record through the shared entity link, so
 * one query answers "what is this record tagged" for every kind.
 *
 * Reads only, for now: shaping the vocabulary is owner/admin work for a
 * settings screen, and applying a tag belongs to the form that edits a
 * record. Both follow the companies.ts pattern when they arrive.
 */

export type Tag = Tables<'tags'>;

/** The tags on one record, by name. */
export async function listTagsFor(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef
): Promise<Tag[]> {
	const rows = unwrap(
		await supabase
			.from('taggings')
			.select('tags!inner(*)')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
	);
	return rows.map((row) => row.tags).sort((a, b) => a.name.localeCompare(b.name));
}
