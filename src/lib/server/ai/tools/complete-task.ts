import { tool } from 'ai';
import { z } from 'zod';
import { completeTask as markDone } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { summarizeTask, taskSummarySchema } from './list-tasks';

export const completeTaskAccess: ToolAccess = { feature: 'tasks', level: 'manage' };

export const completeTask = tool({
	description: 'Mark a task done, or reopen one. Needs the task id from listTasks.',
	inputSchema: z.object({
		taskId: z.guid().describe('The task id, from listTasks.'),
		done: z.boolean().default(true).describe('true marks it done (the default); false reopens it.')
	}),
	outputSchema: z.object({ task: taskSummarySchema }),
	contextSchema: toolContextSchema,
	execute: async ({ taskId, done }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, completeTaskAccess);
		const task = await markDone(supabase, orgId, taskId, done);
		return { task: summarizeTask(task) };
	}
});
