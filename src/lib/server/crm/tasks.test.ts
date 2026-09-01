import { describe, expect, it } from 'vitest';
import { completeTask, createTask, deleteTask, listTasks } from './tasks';
import { ORG_ID, supabaseMock } from './test-support';

const TASK_ID = '50000000-0000-0000-0000-000000000001';

describe('tasks data access', () => {
	it('lists tasks by due date, undated last, newest created first', async () => {
		const rows = [{ id: TASK_ID, title: 'Send renewal quote' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listTasks(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('tasks');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('due_at', { ascending: true, nullsFirst: false });
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('narrows to open tasks for one assignee when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listTasks(supabase, ORG_ID, { assignedTo: 'user-1', openOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('assigned_to', 'user-1');
		expect(builder.is).toHaveBeenCalledWith('completed_at', null);
	});

	it('creates a task under the org without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: TASK_ID } });

		await createTask(supabase, ORG_ID, { title: 'Follow up' });
		expect(builder.insert).toHaveBeenCalledWith({ title: 'Follow up', org_id: ORG_ID });
	});

	it('completes and reopens via completed_at', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: TASK_ID } });

		await completeTask(supabase, ORG_ID, TASK_ID);
		expect(builder.update).toHaveBeenCalledWith({ completed_at: expect.any(String) });

		await completeTask(supabase, ORG_ID, TASK_ID, false);
		expect(builder.update).toHaveBeenCalledWith({ completed_at: null });
	});

	it('deletes scoped to org and id, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: TASK_ID }] });
		await deleteTask(deleted.supabase, ORG_ID, TASK_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', TASK_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteTask(filtered.supabase, ORG_ID, TASK_ID)).rejects.toThrow(
			'Task was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(deleteTask(supabase, ORG_ID, TASK_ID)).rejects.toThrow('boom');
	});
});
