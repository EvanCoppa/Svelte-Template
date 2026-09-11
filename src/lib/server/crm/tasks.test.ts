import { describe, expect, it } from 'vitest';
import {
	RELATIONSHIP_TYPE,
	type RelationshipType,
	type RelationshipWithType
} from './relationships';
import {
	assignTask,
	completeTask,
	createTask,
	deleteTask,
	endTaskAssignment,
	getTask,
	listTaskAssignees,
	listTasks
} from './tasks';
import { ORG_ID, supabaseMock, supabaseTablesMock } from './test-support';

const TASK_ID = '50000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000001';

const STAMPS = { created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };

/** The system type, as the migration ships it after the task system widened it. */
const assignedToType: RelationshipType = {
	id: RELATIONSHIP_TYPE.assignedTo,
	org_id: null,
	key: 'assigned_to',
	forward_label: 'assigned to',
	inverse_label: 'assignee of',
	source_type: null,
	target_type: null,
	is_system: true,
	...STAMPS
};

/** An assignment row as `listRelationships()` returns it, type embedded. */
const ASSIGNMENT: RelationshipWithType = {
	id: 'f1000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	relationship_type_id: RELATIONSHIP_TYPE.assignedTo,
	from_type: 'task',
	from_id: TASK_ID,
	to_type: 'member',
	to_id: USER_ID,
	started_on: '2026-09-01',
	ended_on: null,
	notes: null,
	created_by: USER_ID,
	relationship_types: assignedToType,
	...STAMPS
};

const assignment = (over: Partial<RelationshipWithType> = {}) => ({ ...ASSIGNMENT, ...over });

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

	it('narrows to open tasks when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listTasks(supabase, ORG_ID, { openOnly: true });
		expect(builder.is).toHaveBeenCalledWith('completed_at', null);
	});

	it('reads assignees as assigned_to relationships, named from profiles', async () => {
		const { supabase, builders } = supabaseTablesMock({
			relationships: { data: [assignment()] },
			profiles: { data: [{ id: USER_ID, display_name: 'Evan', email: 'evan@example.com' }] }
		});

		await expect(listTaskAssignees(supabase, ORG_ID, TASK_ID)).resolves.toEqual([
			{
				id: 'f1000000-0000-0000-0000-000000000001',
				userId: USER_ID,
				name: 'Evan',
				startedOn: '2026-09-01',
				endedOn: null
			}
		]);
		expect(builders.relationships.eq).toHaveBeenCalledWith(
			'relationship_type_id',
			RELATIONSHIP_TYPE.assignedTo
		);
	});

	it('keeps a handover in the list, and drops it when only current assignees are wanted', async () => {
		const handedOver = assignment({
			id: 'f1000000-0000-0000-0000-000000000004',
			ended_on: '2026-09-10'
		});
		const { supabase, builders } = supabaseTablesMock({
			relationships: { data: [handedOver] },
			profiles: { data: [{ id: USER_ID, display_name: 'Evan', email: 'evan@example.com' }] }
		});

		const [past] = await listTaskAssignees(supabase, ORG_ID, TASK_ID);
		expect(past.endedOn).toBe('2026-09-10');

		await listTaskAssignees(supabase, ORG_ID, TASK_ID, { openOnly: true });
		expect(builders.relationships.is).toHaveBeenCalledWith('ended_on', null);
	});

	it('drops an assignee whose profile the reader cannot see', async () => {
		const { supabase } = supabaseTablesMock({
			relationships: { data: [assignment()] },
			profiles: { data: [] }
		});

		await expect(listTaskAssignees(supabase, ORG_ID, TASK_ID)).resolves.toEqual([]);
	});

	it('assigns by drawing a relationship from the task to the member, dated today', async () => {
		const { supabase, builders } = supabaseTablesMock({
			relationships: { data: { id: 'f1000000-0000-0000-0000-000000000009' } }
		});

		await assignTask(supabase, ORG_ID, TASK_ID, USER_ID);
		expect(builders.relationships.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			relationship_type_id: RELATIONSHIP_TYPE.assignedTo,
			from_type: 'task',
			from_id: TASK_ID,
			to_type: 'member',
			to_id: USER_ID,
			started_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
		});
	});

	it('ends an assignment rather than deleting it, so the handover survives', async () => {
		const { supabase, builder } = supabaseMock({
			data: { id: 'f1000000-0000-0000-0000-000000000001' }
		});

		await endTaskAssignment(supabase, ORG_ID, 'f1000000-0000-0000-0000-000000000001');
		expect(builder.update).toHaveBeenCalledWith({
			ended_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
		});
		expect(builder.delete).not.toHaveBeenCalled();
	});

	it('fetches one task with both parties, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getTask(supabase, ORG_ID, TASK_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*, companies(id, name), contacts(id, name)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', TASK_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
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
