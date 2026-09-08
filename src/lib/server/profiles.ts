import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { unwrap } from './crm/unwrap';

/**
 * Who a user id is, for the screens that name people a record refers to —
 * who created it, who it is assigned to, who logged an activity. One query
 * for every id on the page. RLS lets a member read the profiles of people
 * they share an organization with (the staff_management migration), so
 * someone who has since left resolves to nothing and the caller falls back
 * to a placeholder rather than a uuid.
 *
 * Named the way the staff roster names a member (`memberName()` in
 * `$lib/components/staff`): display name, else email.
 */
export async function getDisplayNames(
	supabase: SupabaseClient<Database>,
	userIds: readonly string[]
): Promise<ReadonlyMap<string, string>> {
	const ids = [...new Set(userIds)];
	if (ids.length === 0) return new Map();

	const rows = unwrap(
		await supabase.from('profiles').select('id, display_name, email').in('id', ids)
	);
	return new Map(
		rows.flatMap((row) => {
			const name = row.display_name ?? row.email;
			return name ? [[row.id, name] as const] : [];
		})
	);
}
