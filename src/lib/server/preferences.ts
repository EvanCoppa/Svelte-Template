import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { resolvePreferences, type PreferenceKey, type Preferences } from '$lib/preferences';
import { unwrap } from './crm/unwrap';

/**
 * Reading and writing account preferences. The registry and the folding rules
 * are `$lib/preferences`; this is the table.
 *
 * Scoped by `user_id` and by RLS, which is the same boundary twice on purpose:
 * these rows are private to the person they belong to, and the policies grant
 * nobody — not an org owner, not an admin — anyone else's.
 */

/** Every preference for one user: their rows folded over the fallbacks. */
export async function loadPreferences(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<Preferences> {
	const rows = unwrap(
		await supabase.from('user_preferences').select('key, value').eq('user_id', userId)
	);
	return resolvePreferences(rows);
}

/**
 * Writes one preference. An upsert on the composite key, so setting a value
 * for the first time and changing it later are the same call — and one key
 * moving never touches another, which a read-modify-write of one JSON document
 * could not promise.
 *
 * The value is already the key's own type: `jsonb` takes whatever it is
 * handed, so a posted value is parsed against the registry's schema where it
 * arrives — in the action, which can answer with a message — and this writes
 * what came back.
 */
export async function savePreference<K extends PreferenceKey>(
	supabase: SupabaseClient<Database>,
	userId: string,
	key: K,
	value: Preferences[K]
): Promise<void> {
	unwrap(
		await supabase
			.from('user_preferences')
			.upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' })
			.select('key')
	);
}
