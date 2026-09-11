import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { getDisplayNames } from '../profiles';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `task_comments` — the conversation on a task. Same
 * contract as the other modules, and the same shape as the ticket thread in
 * tickets.ts; it lives in its own file because a thread is read and written
 * on its own, several times over the life of one task, while the task row
 * is not touched at all.
 *
 * A message carries its author's name because that is the only way a thread
 * is ever drawn. Naming goes through `getDisplayNames()`, the app's one
 * namer for people, so a message names its author exactly as the roster and
 * a record's assignees do. An author whose profile the reader cannot see
 * keeps the message and loses the name, rather than the message vanishing —
 * a gap in a conversation reads as data loss.
 */

export type TaskComment = Tables<'task_comments'>;

/** One message in a task's thread, ready to draw. */
export type TaskMessage = TaskComment & { authorName: string | null };

type CommentColumn = 'body';

/** A task's thread, oldest first — the order a conversation is read in. */
export async function listTaskComments(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskId: string
): Promise<TaskMessage[]> {
	const rows = unwrap(
		await supabase
			.from('task_comments')
			.select('*')
			.eq('org_id', orgId)
			.eq('task_id', taskId)
			.order('created_at', { ascending: true })
	);

	const names = await getDisplayNames(
		supabase,
		rows.flatMap((row) => (row.author_id ? [row.author_id] : []))
	);

	return rows.map((row) => ({
		...row,
		authorName: row.author_id ? (names.get(row.author_id) ?? null) : null
	}));
}

/**
 * How much conversation each of a page of tasks has collected — one query for
 * the board, where reading each thread would be one per card. The messages
 * themselves are not fetched: a card shows a number, and a number is all this
 * counts.
 *
 * A task nobody has written on is absent from the map rather than present as
 * zero, so a caller draws nothing instead of a zero that means nothing.
 */
export async function countTaskComments(
	supabase: SupabaseClient<Database>,
	orgId: string,
	taskIds: readonly string[]
): Promise<Map<string, number>> {
	const ids = [...new Set(taskIds)];
	if (ids.length === 0) return new Map();

	const rows = unwrap(
		await supabase.from('task_comments').select('task_id').eq('org_id', orgId).in('task_id', ids)
	);

	const counts = new Map<string, number>();
	for (const { task_id } of rows) counts.set(task_id, (counts.get(task_id) ?? 0) + 1);
	return counts;
}

export async function addTaskComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'task_comments'>, 'task_id' | CommentColumn>
): Promise<TaskComment> {
	return unwrap(
		await supabase
			.from('task_comments')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateTaskComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	commentId: string,
	values: Pick<TablesUpdate<'task_comments'>, CommentColumn>
): Promise<TaskComment> {
	return unwrap(
		await supabase
			.from('task_comments')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', commentId)
			.select()
			.single()
	);
}

export async function deleteTaskComment(
	supabase: SupabaseClient<Database>,
	orgId: string,
	commentId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('task_comments')
			.delete()
			.eq('org_id', orgId)
			.eq('id', commentId)
			.select('id'),
		'Comment'
	);
}
