import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `tasks`. Same contract as companies.ts.
 *
 * A task has a `status` (where it sits on the board) and a `completed_at`
 * (when it was finished), and the task_workflow migration's trigger holds the
 * one relationship between them: `status = 'done'` exactly when the timestamp
 * is set. That is why both `completeTask` and `setTaskStatus` below write one
 * column each and neither mentions the other — whichever a caller writes, the
 * database fills in the rest.
 *
 * `completed_at` stays update-only: a task is never born completed, and the
 * insert grant excludes it. A task CAN be born in a column, though, which is
 * what lets the board's "Add" button drop a new card where you clicked.
 */

export type Task = Tables<'tasks'>;

/** A task with the parties it concerns, for detail screens. */
export type TaskWithParties = Task & {
	companies: Pick<Tables<'companies'>, 'id' | 'name'> | null;
	contacts: Pick<Tables<'contacts'>, 'id' | 'name'> | null;
};

type TaskInsertColumn =
	| 'company_id'
	| 'contact_id'
	| 'title'
	| 'details'
	| 'due_at'
	| 'assigned_to'
	| 'status'
	| 'priority';
type TaskUpdateColumn = TaskInsertColumn | 'completed_at';

export async function listTasks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: {
		companyId?: string;
		contactId?: string;
		assignedTo?: string;
		openOnly?: boolean;
		status?: Enums<'task_status'>;
	} = {}
): Promise<Task[]> {
	let query = supabase
		.from('tasks')
		.select('*')
		.eq('org_id', orgId)
		.order('due_at', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo);
	if (filter.status) query = query.eq('status', filter.status);
	if (filter.openOnly) query = query.is('completed_at', null);
	return unwrap(await query);
}

export async function getTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string
): Promise<TaskWithParties | null> {
	return unwrap(
		await supabase
			.from('tasks')
			.select('*, companies(id, name), contacts(id, name)')
			.eq('org_id', orgId)
			.eq('id', taskId)
			.maybeSingle()
	);
}

export async function createTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'tasks'>, TaskInsertColumn>
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
	values: Pick<TablesUpdate<'tasks'>, TaskUpdateColumn>
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

/**
 * Moves a task to a column — what a drag on the board, and the keyboard's way
 * across it, both land on. The trigger sets or clears `completed_at`, so
 * dropping a card in Done finishes it and dragging it back out reopens it
 * without this function knowing the timestamp exists.
 */
export async function setTaskStatus(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string,
	status: Enums<'task_status'>
): Promise<Task> {
	return updateTask(supabase, orgId, taskId, { status });
}

export async function deleteTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('tasks').delete().eq('org_id', orgId).eq('id', taskId).select('id'),
		'Task'
	);
}
