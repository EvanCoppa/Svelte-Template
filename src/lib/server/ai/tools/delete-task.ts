import { tool } from 'ai';
import { z } from 'zod';
import { deleteTask as removeTask } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const deleteTaskAccess: ToolAccess = { feature: 'tasks', level: 'delete' };

/**
 * The one destructive tool in the first cut. The agent lists it under
 * `toolApproval`, so the model's call pauses as an approval request the user
 * answers in the thread before anything runs.
 */
export const deleteTask = tool({
	description:
		'Permanently delete a task. The user is asked to approve each deletion; ' +
		'never call this for a task the user has not clearly named.',
	inputSchema: z.object({
		taskId: z.guid().describe('The task id, from listTasks.'),
		title: z
			.string()
			.max(200)
			.describe('The task title, repeated so the approval card can show it.')
	}),
	outputSchema: z.object({ deleted: z.literal(true), taskId: z.string() }),
	contextSchema: toolContextSchema,
	execute: async ({ taskId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, deleteTaskAccess);
		await removeTask(supabase, orgId, taskId);
		return { deleted: true as const, taskId };
	}
});
