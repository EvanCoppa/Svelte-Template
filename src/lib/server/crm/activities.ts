import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `activities` — the interaction log that replaced `notes`.
 * A note is an activity of type 'note'; a call, an email and a meeting are the
 * same row with a type, a direction and how long it took.
 *
 * Same contract as companies.ts. `author_id` is filled by the database
 * (defaults to the caller) and RLS only lets authors or owners/admins change or
 * delete one afterwards. The entity link is insert-only by grant: an activity
 * describes the record it was logged against, and re-pointing it rewrites
 * history.
 */

export type Activity = Tables<'activities'>;
export type ActivityType = Enums<'activity_type'>;

type ActivityColumn =
	'type' | 'direction' | 'subject' | 'body' | 'occurred_at' | 'duration_minutes';

export async function listActivities(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { entity?: CrmEntityRef; type?: ActivityType } = {}
): Promise<Activity[]> {
	let query = supabase
		.from('activities')
		.select('*')
		.eq('org_id', orgId)
		.order('occurred_at', { ascending: false });
	if (filter.entity) {
		query = query
			.eq('entity_type', filter.entity.entityType)
			.eq('entity_id', filter.entity.entityId);
	}
	if (filter.type) query = query.eq('type', filter.type);
	return unwrap(await query);
}

/**
 * Logs an activity, optionally against a record. `entity` omitted is the
 * org-level note the old `notes` table expressed as a null company_id.
 */
export async function createActivity(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'activities'>, ActivityColumn>,
	entity?: CrmEntityRef
): Promise<Activity> {
	return unwrap(
		await supabase
			.from('activities')
			.insert({
				...values,
				org_id: orgId,
				entity_type: entity?.entityType ?? null,
				entity_id: entity?.entityId ?? null
			})
			.select()
			.single()
	);
}

export async function updateActivity(
	supabase: SupabaseClient<Database>,
	orgId: string,
	activityId: string,
	values: Pick<TablesUpdate<'activities'>, ActivityColumn>
): Promise<Activity> {
	return unwrap(
		await supabase
			.from('activities')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', activityId)
			.select()
			.single()
	);
}

export async function deleteActivity(
	supabase: SupabaseClient<Database>,
	orgId: string,
	activityId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('activities')
			.delete()
			.eq('org_id', orgId)
			.eq('id', activityId)
			.select('id'),
		'Activity'
	);
}
