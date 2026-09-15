import { tool } from 'ai';
import { z } from 'zod';
import { assignTask as createAssignment, listTaskAssignees } from '$lib/server/crm/tasks';
import { toolContextSchema, type AssistantToolContext } from '../context';
import { requireToolContext, type ToolAccess } from './access';

/**
 * Putting someone on a task — and, in `unassign-task.ts`, taking them off it.
 *
 * **Assignment is a relationship, not a column** (docs/tasks.md): a task
 * carries as many people as the work needs, and coming off one ENDS the row
 * rather than deleting it, so a handover stays part of the task's story. That
 * is why this is not `updateRecord` with an "assignee" field — a task has no
 * such field, and `describeTask` deliberately shows no "Assigned to".
 *
 * Both tools are addressed by task and person, never by relationship id: who
 * is on a task is what the user says out loud, and a row id is bookkeeping
 * the model should never have to hold. The schemas live here and the other
 * half imports them, the way `createTask` reads `list-tasks.ts`.
 */

export const assignTaskAccess: ToolAccess = { feature: 'tasks', level: 'manage' };

export const assignmentInputSchema = z.object({
	taskId: z.guid().describe('The task, from listTasks or findRecords.'),
	userId: z.guid().describe('Someone who works here, from listMembers — never a contact’s id.')
});

export const assignmentOutputSchema = z.object({
	/** False when the task already read this way — assigning twice is not an error. */
	changed: z.boolean(),
	taskId: z.string(),
	/** Everyone on the task now, the change included. */
	assignees: z.array(z.object({ userId: z.string(), name: z.string() }))
});

/** Who is on the task now, as both tools answer. */
export async function openAssignees(
	{ supabase, orgId }: AssistantToolContext,
	taskId: string
): Promise<{ userId: string; name: string }[]> {
	const open = await listTaskAssignees(supabase, orgId, taskId, { openOnly: true });
	return open.map(({ userId, name }) => ({ userId, name }));
}

export const assignTask = tool({
	description:
		'Put someone who works here on a task — who will DO it. This is not the same as the ' +
		'company or contact a task is about (that is who it is FOR, set with updateRecord’s ' +
		'company_id and contact_id): a task often has both, and the person doing the work is ' +
		'always a colleague from listMembers. A task can carry several people; assigning ' +
		'someone already on it changes nothing and is safe.',
	inputSchema: assignmentInputSchema,
	outputSchema: assignmentOutputSchema,
	contextSchema: toolContextSchema,
	execute: async ({ taskId, userId }, { context }) => {
		const ctx = requireToolContext(context, assignTaskAccess);
		const before = await openAssignees(ctx, taskId);
		if (before.some((assignee) => assignee.userId === userId)) {
			return { changed: false, taskId, assignees: before };
		}
		await createAssignment(ctx.supabase, ctx.orgId, taskId, userId);
		return { changed: true, taskId, assignees: await openAssignees(ctx, taskId) };
	}
});
