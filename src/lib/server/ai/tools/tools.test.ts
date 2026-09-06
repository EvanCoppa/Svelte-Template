import { describe, expect, it } from 'vitest';
import { orgContext, toolContext, ORG_ID } from '../test-support';
import { createTask } from './create-task';
import { deleteTask } from './delete-task';
import { searchClients } from './search-clients';

/**
 * The tools call the CRM data modules with the request client and org id —
 * the same road a page takes — and refuse when the caller may not.
 */

const CLIENT_ID = '20000000-0000-0000-0000-000000000001';
const TASK_ID = '50000000-0000-0000-0000-000000000001';

const options = (context: ReturnType<typeof toolContext>) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

describe('searchClients', () => {
	it('lists the org’s clients and filters them in memory, capped and counted', async () => {
		const rows = [
			{ id: CLIENT_ID, name: 'Wayne Enterprises', company: 'Wayne', email: null, status: 'active' },
			{ id: 'x', name: 'Stark Industries', company: null, email: 'c@stark.example', status: 'lead' }
		];
		const context = toolContext(orgContext(), { data: rows });

		const result = await searchClients.execute!({ query: 'stark' }, options(context));

		expect(context.mock.from).toHaveBeenCalledWith('clients');
		expect(context.mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(result).toEqual({
			clients: [
				{
					id: 'x',
					name: 'Stark Industries',
					company: null,
					email: 'c@stark.example',
					status: 'lead'
				}
			],
			total: 1
		});
	});
});

describe('createTask', () => {
	it('inserts through the tasks module, under the org', async () => {
		const row = {
			id: TASK_ID,
			title: 'Send renewal quote',
			details: null,
			due_at: null,
			completed_at: null,
			client_id: CLIENT_ID
		};
		const context = toolContext(orgContext(), { data: row });

		const result = await createTask.execute!(
			{ title: 'Send renewal quote', clientId: CLIENT_ID },
			options(context)
		);

		expect(context.mock.from).toHaveBeenCalledWith('tasks');
		expect(context.mock.builder.insert).toHaveBeenCalledWith({
			title: 'Send renewal quote',
			client_id: CLIENT_ID,
			details: null,
			due_at: null,
			org_id: ORG_ID
		});
		expect(result).toEqual({
			task: {
				id: TASK_ID,
				title: 'Send renewal quote',
				details: null,
				dueAt: null,
				completedAt: null,
				clientId: CLIENT_ID
			}
		});
	});

	it('refuses before touching the database when the caller only reads tasks', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { tasks: 'read' } }));

		await expect(createTask.execute!({ title: 'Nope' }, options(context))).rejects.toThrow(
			/does not allow "manage" on tasks/
		);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});

describe('deleteTask', () => {
	it('deletes through the tasks module and reports the id back', async () => {
		const context = toolContext(orgContext(), { data: [{ id: TASK_ID }] });

		const result = await deleteTask.execute!(
			{ taskId: TASK_ID, title: 'Send renewal quote' },
			options(context)
		);

		expect(context.mock.builder.delete).toHaveBeenCalled();
		expect(result).toEqual({ deleted: true, taskId: TASK_ID });
	});

	it('surfaces a delete RLS filtered away as an error, not a success', async () => {
		const context = toolContext(orgContext(), { data: [] });

		await expect(
			deleteTask.execute!({ taskId: TASK_ID, title: 'x' }, options(context))
		).rejects.toThrow('Task was not deleted');
	});
});
