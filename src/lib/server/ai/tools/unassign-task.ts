import { tool } from 'ai';
import { endTaskAssignment, listTaskAssignees } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { assignmentInputSchema, assignmentOutputSchema, openAssignees } from './assign-task';

/** The other half of assignment; see `assign-task.ts` for why it is a relationship. */
export const unassignTaskAccess: ToolAccess = { feature: 'tasks', level: 'manage' };

export const unassignTask = tool({
	description:
		'Take someone off a task. The assignment is ended rather than erased, so who held the ' +
		'task until now stays part of its history, and the same person can be put back on it ' +
		'later. Taking off someone who is not on it changes nothing.',
	inputSchema: assignmentInputSchema,
	outputSchema: assignmentOutputSchema,
	contextSchema: toolContextSchema,
	execute: async ({ taskId, userId }, { context }) => {
		const ctx = requireToolContext(context, unassignTaskAccess);
		// The row id is what ending one needs, so it is looked up here rather
		// than asked for: the model names the person, as the user did.
		const open = await listTaskAssignees(ctx.supabase, ctx.orgId, taskId, { openOnly: true });
		const held = open.find((assignee) => assignee.userId === userId);
		if (!held) {
			return {
				changed: false,
				taskId,
				assignees: open.map(({ userId: id, name }) => ({ userId: id, name }))
			};
		}
		await endTaskAssignment(ctx.supabase, ctx.orgId, held.id);
		return { changed: true, taskId, assignees: await openAssignees(ctx, taskId) };
	}
});
