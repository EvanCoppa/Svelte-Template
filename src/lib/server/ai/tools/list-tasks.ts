import { tool } from 'ai';
import { z } from 'zod';
import { listTasks as loadTasks, type Task } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const listTasksAccess: ToolAccess = { feature: 'tasks', level: 'read' };

export const taskSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	details: z.string().nullable(),
	dueAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	clientId: z.string().nullable()
});

export function summarizeTask(task: Task): z.infer<typeof taskSummarySchema> {
	return {
		id: task.id,
		title: task.title,
		details: task.details,
		dueAt: task.due_at,
		completedAt: task.completed_at,
		clientId: task.client_id
	};
}

export const listTasks = tool({
	description:
		'List tasks, soonest due first. Open tasks by default; ' +
		'narrow to one client with its id from searchClients.',
	inputSchema: z.object({
		clientId: z.guid().optional().describe('Only tasks for this client.'),
		openOnly: z
			.boolean()
			.default(true)
			.describe('Leave out completed tasks (the default). Set false to include them.')
	}),
	outputSchema: z.object({ tasks: z.array(taskSummarySchema) }),
	contextSchema: toolContextSchema,
	execute: async ({ clientId, openOnly }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listTasksAccess);
		const tasks = await loadTasks(supabase, orgId, { clientId, openOnly });
		return { tasks: tasks.map(summarizeTask) };
	}
});
