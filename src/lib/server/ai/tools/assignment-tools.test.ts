import { describe, expect, it } from 'vitest';
import { supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import { RELATIONSHIP_TYPE } from '$lib/server/crm/relationships';
import type { AssistantToolContext } from '../context';
import { orgContext, toolContext, ORG_ID, USER_ID } from '../test-support';
import { assignTask } from './assign-task';
import { createTask } from './create-task';
import { listMembers } from './list-members';
import { unassignTask } from './unassign-task';

/**
 * Putting people on work, and telling that apart from who the work is for.
 * Assignment is a relationship (docs/tasks.md), so these tools read and write
 * `relationships` rows rather than a column, and both are addressed by task
 * and person rather than by the row id that implements it.
 */

const TASK_ID = '50000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const DANA_ID = '00000000-0000-0000-0000-0000000000d1';
const ASSIGNMENT_ID = 'a0000000-0000-0000-0000-000000000001';

/** A tool's result. None of these tools stream, so the SDK's iterable form never arrives. */
function settled<T>(result: T | AsyncIterable<T>): T {
	// SAFETY: every tool here returns its object from `execute`; the streaming form is never used.
	return result as T;
}

const options = (context: AssistantToolContext) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

/** An open `assigned_to` row, as `listTaskAssignees()` reads it: task → member. */
function assignment(userId: string, id = ASSIGNMENT_ID) {
	return {
		id,
		org_id: ORG_ID,
		relationship_type_id: RELATIONSHIP_TYPE.assignedTo,
		from_type: 'task',
		from_id: TASK_ID,
		to_type: 'member',
		to_id: userId,
		started_on: '2026-09-01',
		ended_on: null,
		notes: null,
		created_at: '2026-09-01T09:00:00Z',
		updated_at: '2026-09-01T09:00:00Z',
		relationship_types: {
			id: RELATIONSHIP_TYPE.assignedTo,
			forward_label: 'assigned to',
			inverse_label: 'assigned'
		}
	};
}

const danaProfile = { id: DANA_ID, display_name: 'Dana Reyes', email: 'dana@acme.test' };

/** A tool context over the table double, for the tools that read two tables to answer. */
function tablesContext(
	results: Parameters<typeof supabaseTablesMock>[0],
	org = orgContext()
): AssistantToolContext & { db: ReturnType<typeof supabaseTablesMock> } {
	const db = supabaseTablesMock(results);
	return { supabase: db.supabase, orgId: ORG_ID, userId: USER_ID, org, db };
}

describe('listMembers', () => {
	it('names everyone who works here and marks the caller', async () => {
		const context = tablesContext({
			organization_members: {
				data: [
					{
						user_id: DANA_ID,
						role: 'member',
						created_at: '2026-01-02T00:00:00Z',
						profiles: { display_name: 'Dana Reyes', email: 'dana@acme.test', avatar_url: null },
						member_roles: []
					},
					{
						user_id: USER_ID,
						role: 'owner',
						created_at: '2026-01-01T00:00:00Z',
						profiles: { display_name: 'Alex Owner', email: 'alex@acme.test', avatar_url: null },
						member_roles: []
					}
				]
			}
		});

		const result = await listMembers.execute!({}, options(context));

		expect(result).toEqual({
			members: [
				{ userId: USER_ID, name: 'Alex Owner', role: 'owner', isYou: true },
				{ userId: DANA_ID, name: 'Dana Reyes', role: 'member', isYou: false }
			]
		});
	});

	it('is offered on the strength of any feature that names a person, not the staff page', async () => {
		// A member who may only read tasks: the roster is how they name
		// somebody to put on one, exactly as the tasks page shows it to them.
		const context = tablesContext(
			{ organization_members: { data: [] } },
			orgContext({
				role: 'member',
				grants: { tasks: 'read' }
			})
		);
		await expect(listMembers.execute!({}, options(context))).resolves.toEqual({ members: [] });
	});

	it('refuses a member whose grants reach none of those features', async () => {
		const context = tablesContext(
			{},
			orgContext({ role: 'member', grants: { products: 'manage' } })
		);
		await expect(listMembers.execute!({}, options(context))).rejects.toThrow(
			/does not allow "read" on the people who work here/
		);
	});
});

describe('assignTask', () => {
	it('draws an assigned_to relationship from the task to the member', async () => {
		const db = supabaseMockSequence([
			// The open assignments before: nobody on it yet.
			{ data: [] },
			// The insert.
			{ data: assignment(DANA_ID) },
			// The open assignments after, then the names behind them.
			{ data: [assignment(DANA_ID)] },
			{ data: [danaProfile] }
		]);
		const context: AssistantToolContext = {
			supabase: db.supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		const result = await assignTask.execute!(
			{ taskId: TASK_ID, userId: DANA_ID },
			options(context)
		);

		expect(db.from).toHaveBeenCalledWith('relationships');
		expect(db.builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			relationship_type_id: RELATIONSHIP_TYPE.assignedTo,
			from_type: 'task',
			from_id: TASK_ID,
			to_type: 'member',
			to_id: DANA_ID,
			started_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
		});
		expect(result).toEqual({
			changed: true,
			taskId: TASK_ID,
			assignees: [{ userId: DANA_ID, name: 'Dana Reyes' }]
		});
	});

	it('assigning someone already on it writes nothing and is not an error', async () => {
		const context = tablesContext({
			relationships: { data: [assignment(DANA_ID)] },
			profiles: { data: [danaProfile] }
		});

		const result = await assignTask.execute!(
			{ taskId: TASK_ID, userId: DANA_ID },
			options(context)
		);

		expect(result).toEqual({
			changed: false,
			taskId: TASK_ID,
			assignees: [{ userId: DANA_ID, name: 'Dana Reyes' }]
		});
		expect(context.db.builders.relationships.insert).not.toHaveBeenCalled();
	});

	it('refuses before touching the database when the caller only reads tasks', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { tasks: 'read' } }));
		await expect(
			assignTask.execute!({ taskId: TASK_ID, userId: DANA_ID }, options(context))
		).rejects.toThrow(/does not allow "manage" on tasks/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});

describe('unassignTask', () => {
	it('ends the assignment rather than deleting it, so the handover stays history', async () => {
		const db = supabaseMockSequence([
			{ data: [assignment(DANA_ID)] },
			{ data: [danaProfile] },
			// The update that ends it, then the empty list afterwards.
			{ data: { ...assignment(DANA_ID), ended_on: '2026-09-14' } },
			{ data: [] }
		]);
		const context: AssistantToolContext = {
			supabase: db.supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		const result = await unassignTask.execute!(
			{ taskId: TASK_ID, userId: DANA_ID },
			options(context)
		);

		expect(db.builder.update).toHaveBeenCalledWith({
			ended_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
		});
		expect(db.builder.delete).not.toHaveBeenCalled();
		expect(result).toEqual({ changed: true, taskId: TASK_ID, assignees: [] });
	});

	it('taking off someone who is not on it changes nothing', async () => {
		const context = tablesContext({
			relationships: { data: [assignment(DANA_ID)] },
			profiles: { data: [danaProfile] }
		});

		const result = await unassignTask.execute!(
			{ taskId: TASK_ID, userId: USER_ID },
			options(context)
		);

		expect(result).toEqual({
			changed: false,
			taskId: TASK_ID,
			assignees: [{ userId: DANA_ID, name: 'Dana Reyes' }]
		});
		expect(context.db.builders.relationships.update).not.toHaveBeenCalled();
	});
});

describe('createTask — assigning and linking are two different things', () => {
	it('writes the party on the row and each assignee as a relationship', async () => {
		const task = {
			id: TASK_ID,
			title: 'Call back about the quote',
			details: null,
			due_at: null,
			completed_at: null,
			company_id: COMPANY_ID,
			contact_id: null
		};
		const db = supabaseMockSequence([
			{ data: task },
			{ data: assignment(DANA_ID) },
			{ data: assignment(USER_ID, 'a0000000-0000-0000-0000-000000000002') }
		]);
		const context: AssistantToolContext = {
			supabase: db.supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		const result = settled(
			await createTask.execute!(
				{
					title: 'Call back about the quote',
					companyId: COMPANY_ID,
					// The same person twice: the database refuses a second open
					// assignment, so the tool asks once.
					assignees: [DANA_ID, USER_ID, DANA_ID]
				},
				options(context)
			)
		);

		expect(db.from).toHaveBeenNthCalledWith(1, 'tasks');
		expect(db.from).toHaveBeenNthCalledWith(2, 'relationships');
		expect(db.from).toHaveBeenNthCalledWith(3, 'relationships');
		expect(db.from).toHaveBeenCalledTimes(3);
		expect(result.task.companyId).toBe(COMPANY_ID);
		expect(result.assignees).toEqual([DANA_ID, USER_ID]);
	});
});
