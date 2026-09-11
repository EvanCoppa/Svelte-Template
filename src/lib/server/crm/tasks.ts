import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { getDisplayNames } from '../profiles';
import type { CrmEntityRef } from './entity';
import {
	createRelationship,
	listRelationships,
	orientRelationship,
	updateRelationship,
	RELATIONSHIP_TYPE
} from './relationships';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `tasks`. Same contract as companies.ts. "Done" is
 * `completed_at` being set — there is no separate status flag, and the
 * column is update-only (a task is never born completed; the insert grant
 * excludes it).
 *
 * **Assignment is not a column here.** A task is assigned to as many people
 * as the work needs, and a handover is worth keeping, so assignees are
 * `assigned_to` relationships (the task system migration): one open row per
 * person, and an ended row where someone used to hold it. The helpers below
 * are the only place that shape is known — a caller asks for a task's
 * assignees, not for relationships of a particular type.
 */

export type Task = Tables<'tasks'>;

/** A task with the parties it concerns, for detail screens. */
export type TaskWithParties = Task & {
	companies: Pick<Tables<'companies'>, 'id' | 'name'> | null;
	contacts: Pick<Tables<'contacts'>, 'id' | 'name'> | null;
};

/** One person a task is, or was, assigned to. */
export type TaskAssignee = {
	/** The relationship row, which is what ending or removing it needs. */
	id: string;
	userId: string;
	name: string;
	startedOn: string | null;
	endedOn: string | null;
};

type TaskInsertColumn = 'company_id' | 'contact_id' | 'title' | 'details' | 'due_at' | 'priority';
type TaskUpdateColumn = TaskInsertColumn | 'completed_at';

const taskEntity = (taskId: string): CrmEntityRef => ({ entityType: 'task', entityId: taskId });

export async function listTasks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { companyId?: string; contactId?: string; openOnly?: boolean } = {}
): Promise<Task[]> {
	let query = supabase
		.from('tasks')
		.select('*')
		.eq('org_id', orgId)
		.order('due_at', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false });
	if (filter.companyId) query = query.eq('company_id', filter.companyId);
	if (filter.contactId) query = query.eq('contact_id', filter.contactId);
	if (filter.openOnly) query = query.is('completed_at', null);
	return unwrap(await query);
}

/**
 * The people a task is assigned to, current first. `openOnly` drops the
 * handovers — who holds it now, rather than who ever did.
 */
export async function listTaskAssignees(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string,
	filter: { openOnly?: boolean } = {}
): Promise<TaskAssignee[]> {
	const entity = taskEntity(taskId);
	const rows = await listRelationships(supabase, orgId, entity, {
		typeId: RELATIONSHIP_TYPE.assignedTo,
		openOnly: filter.openOnly
	});

	// The task is always the `from` side of an assignment, but orienting the
	// row rather than reading `to_id` keeps the one rule about which side is
	// which in the relationships module.
	const oriented = rows.flatMap((row) => {
		const { other } = orientRelationship(row, entity);
		return other.entityType === 'member' ? [{ row, userId: other.entityId }] : [];
	});

	const names = await getDisplayNames(
		supabase,
		oriented.map(({ userId }) => userId)
	);

	return oriented.flatMap(({ row, userId }) => {
		const name = names.get(userId);
		return name
			? [{ id: row.id, userId, name, startedOn: row.started_on, endedOn: row.ended_on }]
			: [];
	});
}

/**
 * Assigns a task to someone, from today. The database refuses a second open
 * assignment to the same person (the one-open-per-pair index), so this is
 * safe to call twice.
 */
export async function assignTask(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string,
	userId: string
): Promise<void> {
	await createRelationship(supabase, orgId, {
		typeId: RELATIONSHIP_TYPE.assignedTo,
		from: taskEntity(taskId),
		to: { entityType: 'member', entityId: userId },
		started_on: new Date().toISOString().slice(0, 10)
	});
}

/**
 * Ends an assignment rather than deleting it: who held this task until today
 * is part of its story, and the same person can be assigned again later.
 * Pass a relationship id, which is what `listTaskAssignees()` returns.
 */
export async function endTaskAssignment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	relationshipId: string
): Promise<void> {
	await updateRelationship(supabase, orgId, relationshipId, {
		ended_on: new Date().toISOString().slice(0, 10)
	});
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
