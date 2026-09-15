import { tool } from 'ai';
import { z } from 'zod';
import { assignTask, createTask as insertTask } from '$lib/server/crm/tasks';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { summarizeTask, taskSummarySchema } from './list-tasks';

export const createTaskAccess: ToolAccess = { feature: 'tasks', level: 'manage' };

/**
 * The one kind of record the generic `createRecord` does not write, for the
 * reason the tasks page keeps its own modal instead of `CreateRecord`: the
 * row is not the whole act. Who is ON a task is a relationship, so this
 * writes the task and its `assigned_to` rows in one call — and who the task
 * is FOR is a party, which is a different question with its own two ids.
 */
export const createTask = tool({
	description:
		'Create a task, and put people on it. Two different links, and a task often has both: ' +
		'ASSIGN it to colleagues who work here (assignees — user ids from listMembers; they ' +
		'are who will do the work), and LINK it to the company or the contact it is ABOUT ' +
		'(companyId / contactId — ids from searchCompanies, searchContacts or findRecords; ' +
		'they are the customer it concerns). Never pass a contact as an assignee or a ' +
		'colleague as the company. When the user does not say who should do it, assign it to ' +
		'them — listMembers marks which member they are. Resolve relative dates such as ' +
		'"Friday" against the session time zone before passing dueAt.',
	inputSchema: z.object({
		title: z.string().trim().min(1).max(200).describe('What needs doing, as a short imperative.'),
		assignees: z
			.array(z.guid())
			.max(20)
			.optional()
			.describe('Who will do it: user ids of people who work here, from listMembers.'),
		companyId: z.guid().optional().describe('The company this task is about, if any.'),
		contactId: z.guid().optional().describe('The contact this task is about, if any.'),
		details: z.string().trim().max(2000).optional().describe('Anything the title leaves out.'),
		dueAt: z.iso
			.datetime({ offset: true })
			.optional()
			.describe('When it is due, as an ISO 8601 timestamp with offset.')
	}),
	outputSchema: z.object({
		task: taskSummarySchema,
		/** Who ended up on it — the ids that were assigned, in the order they were given. */
		assignees: z.array(z.string())
	}),
	contextSchema: toolContextSchema,
	execute: async ({ title, assignees, companyId, contactId, details, dueAt }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, createTaskAccess);
		const task = await insertTask(supabase, orgId, {
			title,
			company_id: companyId ?? null,
			contact_id: contactId ?? null,
			details: details ?? null,
			due_at: dueAt ?? null
		});

		// One at a time and de-duplicated, exactly as the task modal writes
		// them: a second open assignment to the same person is what the
		// database refuses, and asking it to is not an answer.
		const people = [...new Set(assignees ?? [])];
		for (const userId of people) {
			await assignTask(supabase, orgId, task.id, userId);
		}
		return { task: summarizeTask(task), assignees: people };
	}
});
