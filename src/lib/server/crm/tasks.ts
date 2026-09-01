import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { ensure, unwrap } from './unwrap';

/**
 * Data access for `tasks`. Same contract as clients.ts. "Done" is
 * `completed_at` being set — there is no separate status flag.
 */

export type Task = Tables<'tasks'>;

export async function listTasks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { clientId?: string; assignedTo?: string; openOnly?: boolean } = {}
): Promise<Task[]> {
	let query = supabase
		.from('tasks')
		.select('*')
		.eq('org_id', orgId)
		.order('due_at', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false });
	if (filter.clientId) query = query.eq('client_id', filter.clientId);
	if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo);
	if (filter.openOnly) query = query.is('completed_at', null);
	return unwrap(await query);
}

export async function createTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Omit<TablesInsert<'tasks'>, 'org_id' | 'created_by'>
): Promise<Task> {
	return unwrap(
		await supabase
			.from('tasks')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string,
	values: TablesUpdate<'tasks'>
): Promise<Task> {
	return unwrap(
		await supabase
			.from('tasks')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', taskId)
			.select()
			.single()
	);
}

/** Marks a task done now; pass `done: false` to reopen it. */
export async function completeTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string,
	done = true
): Promise<Task> {
	return updateTask(supabase, orgId, taskId, {
		completed_at: done ? new Date().toISOString() : null
	});
}

export async function deleteTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string
): Promise<void> {
	ensure(await supabase.from('tasks').delete().eq('org_id', orgId).eq('id', taskId));
}
