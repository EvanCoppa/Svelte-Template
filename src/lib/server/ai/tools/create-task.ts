import { tool } from 'ai';
import { z } from 'zod';
import { createTask as insertTask } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { summarizeTask, taskSummarySchema } from './list-tasks';

export const createTaskAccess: ToolAccess = { feature: 'tasks', level: 'manage' };

export const createTask = tool({
	description:
		'Create a task. Attach it to a client when the user names one (look the id up first); ' +
		'resolve relative dates such as "Friday" against the session time zone before passing dueAt.',
	inputSchema: z.object({
		title: z.string().trim().min(1).max(200).describe('What needs doing, as a short imperative.'),
		clientId: z.guid().optional().describe('The client this task is about, if any.'),
		details: z.string().trim().max(2000).optional().describe('Anything the title leaves out.'),
		dueAt: z.iso
			.datetime({ offset: true })
			.optional()
			.describe('When it is due, as an ISO 8601 timestamp with offset.')
	}),
	outputSchema: z.object({ task: taskSummarySchema }),
	contextSchema: toolContextSchema,
	execute: async ({ title, clientId, details, dueAt }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, createTaskAccess);
		const task = await insertTask(supabase, orgId, {
			title,
			client_id: clientId ?? null,
			details: details ?? null,
			due_at: dueAt ?? null
		});
		return { task: summarizeTask(task) };
	}
});
