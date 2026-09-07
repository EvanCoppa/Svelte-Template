import { describe, expect, it } from 'vitest';
import { orgContext, toolContext, ORG_ID } from '../test-support';
import { createTask } from './create-task';
import { deleteTask } from './delete-task';
import { searchCompanies } from './search-companies';
import { searchContacts } from './search-contacts';

/**
 * The tools call the CRM data modules with the request client and org id —
 * the same road a page takes — and refuse when the caller may not.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const TASK_ID = '50000000-0000-0000-0000-000000000001';

const options = (context: ReturnType<typeof toolContext>) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

describe('searchCompanies', () => {
	it('lists the org’s companies and filters them in memory, capped and counted', async () => {
		const rows = [
			{
				id: COMPANY_ID,
				name: 'Wayne Enterprises',
				email: null,
				relationship: 'customer',
				status: 'active'
			},
			{
				id: 'x',
				name: 'Stark Industries',
				email: 'contact@stark.example',
				relationship: 'supplier',
				status: 'lead'
			}
		];
		const context = toolContext(orgContext(), { data: rows });

		const result = await searchCompanies.execute!({ query: 'stark' }, options(context));

		expect(context.mock.from).toHaveBeenCalledWith('companies');
		expect(context.mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(result).toEqual({
			companies: [
				{
					id: 'x',
					name: 'Stark Industries',
					email: 'contact@stark.example',
					relationship: 'supplier',
					status: 'lead'
				}
			],
			total: 1
		});
	});

	it('hands the relationship filter to the query instead of filtering in memory', async () => {
		const context = toolContext(orgContext(), { data: [] });

		await searchCompanies.execute!({ relationship: 'supplier' }, options(context));

		expect(context.mock.builder.eq).toHaveBeenCalledWith('relationship', 'supplier');
	});
});

describe('searchContacts', () => {
	it('names the company a person belongs to, or null when they stand alone', async () => {
		const rows = [
			{
				id: CONTACT_ID,
				name: 'Lucius Fox',
				email: 'lucius@wayne.example',
				phone: null,
				title: 'CEO',
				is_primary: true,
				status: 'active',
				companies: { id: COMPANY_ID, name: 'Wayne Enterprises' }
			},
			{
				id: 'y',
				name: 'Bruce Wayne',
				email: null,
				phone: null,
				title: null,
				is_primary: false,
				status: 'lead',
				companies: null
			}
		];
		const context = toolContext(orgContext(), { data: rows });

		const result = await searchContacts.execute!({}, options(context));

		expect(context.mock.from).toHaveBeenCalledWith('contacts');
		expect(result).toEqual({
			contacts: [
				{
					id: CONTACT_ID,
					name: 'Lucius Fox',
					email: 'lucius@wayne.example',
					phone: null,
					title: 'CEO',
					isPrimary: true,
					status: 'active',
					companyId: COMPANY_ID,
					companyName: 'Wayne Enterprises'
				},
				{
					id: 'y',
					name: 'Bruce Wayne',
					email: null,
					phone: null,
					title: null,
					isPrimary: false,
					status: 'lead',
					companyId: null,
					companyName: null
				}
			],
			total: 2
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
			company_id: COMPANY_ID,
			contact_id: null
		};
		const context = toolContext(orgContext(), { data: row });

		const result = await createTask.execute!(
			{ title: 'Send renewal quote', companyId: COMPANY_ID },
			options(context)
		);

		expect(context.mock.from).toHaveBeenCalledWith('tasks');
		expect(context.mock.builder.insert).toHaveBeenCalledWith({
			title: 'Send renewal quote',
			company_id: COMPANY_ID,
			contact_id: null,
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
				companyId: COMPANY_ID,
				contactId: null
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
