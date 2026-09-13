import { describe, expect, it } from 'vitest';
import {
	addTaskComment,
	countTaskComments,
	deleteTaskComment,
	listTaskComments,
	updateTaskComment,
	type TaskComment
} from './task-comments';
import { ORG_ID, supabaseMock, supabaseTablesMock } from './test-support';

const TASK_ID = '50000000-0000-0000-0000-000000000001';
const COMMENT_ID = 'f4000000-0000-0000-0000-000000000001';
const AUTHOR_ID = '00000000-0000-0000-0000-000000000003';

const COMMENT: TaskComment = {
	id: COMMENT_ID,
	org_id: ORG_ID,
	task_id: TASK_ID,
	author_id: AUTHOR_ID,
	body: 'Worth leading with the usage numbers.',
	created_at: '2026-09-09T09:00:00Z',
	updated_at: '2026-09-09T09:00:00Z'
};

const comment = (over: Partial<TaskComment> = {}) => ({ ...COMMENT, ...over });

describe('task comments data access', () => {
	it('reads a thread oldest first, naming each author', async () => {
		const { supabase, builders } = supabaseTablesMock({
			task_comments: { data: [comment()] },
			profiles: { data: [{ id: AUTHOR_ID, display_name: 'Evan', email: 'evan@example.com' }] }
		});

		await expect(listTaskComments(supabase, ORG_ID, TASK_ID)).resolves.toEqual([
			{ ...comment(), authorName: 'Evan' }
		]);
		expect(builders.task_comments.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builders.task_comments.eq).toHaveBeenCalledWith('task_id', TASK_ID);
		expect(builders.task_comments.order).toHaveBeenCalledWith('created_at', { ascending: true });
	});

	it('keeps a message whose author cannot be named rather than dropping it', async () => {
		const { supabase } = supabaseTablesMock({
			task_comments: {
				data: [comment(), comment({ id: 'f4000000-0000-0000-0000-000000000002', author_id: null })]
			},
			profiles: { data: [] }
		});

		const thread = await listTaskComments(supabase, ORG_ID, TASK_ID);
		// A gap in a conversation reads as data loss, so an unnamed author
		// loses the name and keeps the message.
		expect(thread).toHaveLength(2);
		expect(thread.map((message) => message.authorName)).toEqual([null, null]);
	});

	it('posts under the org without naming the author, who defaults to the caller', async () => {
		const { supabase, from, builder } = supabaseMock({ data: comment() });

		await addTaskComment(supabase, ORG_ID, { task_id: TASK_ID, body: 'On it.' });
		expect(from).toHaveBeenCalledWith('task_comments');
		expect(builder.insert).toHaveBeenCalledWith({
			task_id: TASK_ID,
			body: 'On it.',
			org_id: ORG_ID
		});
	});

	it('edits only the body, scoped to the org and the message', async () => {
		const { supabase, builder } = supabaseMock({ data: comment({ body: 'Edited.' }) });

		await updateTaskComment(supabase, ORG_ID, COMMENT_ID, { body: 'Edited.' });
		expect(builder.update).toHaveBeenCalledWith({ body: 'Edited.' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', COMMENT_ID);
	});

	it('counts a board of threads in one query, and leaves a silent task out', async () => {
		const other = '50000000-0000-0000-0000-000000000002';
		const { supabase, builder } = supabaseMock({
			data: [{ task_id: TASK_ID }, { task_id: TASK_ID }, { task_id: other }]
		});

		const counts = await countTaskComments(supabase, ORG_ID, [TASK_ID, other, 'quiet-one']);
		expect(counts.get(TASK_ID)).toBe(2);
		expect(counts.get(other)).toBe(1);
		expect(counts.has('quiet-one')).toBe(false);
		// The messages themselves are never read — a card shows a number.
		expect(builder.select).toHaveBeenCalledWith('task_id');
		expect(builder.in).toHaveBeenCalledWith('task_id', [TASK_ID, other, 'quiet-one']);
	});

	it('asks nothing of an empty board', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await expect(countTaskComments(supabase, ORG_ID, [])).resolves.toEqual(new Map());
		expect(builder.select).not.toHaveBeenCalled();
	});

	it('deletes with evidence, throwing when RLS filtered the row away', async () => {
		const deleted = supabaseMock({ data: [{ id: COMMENT_ID }] });
		await deleteTaskComment(deleted.supabase, ORG_ID, COMMENT_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteTaskComment(filtered.supabase, ORG_ID, COMMENT_ID)).rejects.toThrow(
			'Comment was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(deleteTaskComment(supabase, ORG_ID, COMMENT_ID)).rejects.toThrow('boom');
	});
});
