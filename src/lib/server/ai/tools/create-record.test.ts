import { describe, expect, it } from 'vitest';
import { RECORD_TYPES } from '$lib/schemas/records';
import { supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { AssistantToolContext } from '../context';
import { orgContext, toolContext, ORG_ID, USER_ID } from '../test-support';
import { addNote } from './add-note';
import { CREATABLE_KINDS, createRecord } from './create-record';
import { listRecordFields } from './list-record-fields';

/**
 * Writing a new record of any kind, through the same registry, schema and
 * column mapping the workspace's own "Add" form uses — and the form
 * description the model reads before it tries.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

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

/** The three term rows `loadVocabulary()` insists on, for the read that names what was made. */
const terms = ['proposal_presenter', 'proposal_responsible', 'graph_member'].map((id) => ({
	id,
	label: id,
	industry_terms: []
}));

describe('createRecord', () => {
	it('writes the kind’s columns and answers with the record it made', async () => {
		const row = {
			id: CONTACT_ID,
			org_id: ORG_ID,
			company_id: COMPANY_ID,
			name: 'Dana Reyes',
			title: 'Head of Operations',
			email: null,
			phone: null,
			is_primary: false,
			status: 'lead',
			companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
			created_at: '2026-09-01T09:00:00Z',
			updated_at: '2026-09-01T09:00:00Z',
			created_by: USER_ID
		};
		const db = supabaseMockSequence([
			// The insert, then the terms and the read that names the result.
			{ data: row },
			{ data: terms },
			{ data: row }
		]);
		const context: AssistantToolContext = {
			supabase: db.supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		const result = await createRecord.execute!(
			{ kind: 'contact', values: { name: 'Dana Reyes', title: 'Head of Operations' } },
			options(context)
		);

		expect(db.from).toHaveBeenNthCalledWith(1, 'contacts');
		// A field left out is the column's empty value, exactly as an untouched
		// input would be — never "leave it as it was".
		expect(db.builder.insert).toHaveBeenCalledWith({
			name: 'Dana Reyes',
			title: 'Head of Operations',
			email: null,
			phone: null,
			status: 'lead',
			org_id: ORG_ID
		});
		expect(result).toEqual({
			created: true,
			issues: [],
			record: { kind: 'contact', id: CONTACT_ID, name: 'Dana Reyes' }
		});
	});

	it('hands back what the schema refused, and the form, so one retry can fix it', async () => {
		const context = toolContext(orgContext());

		const result = settled(
			await createRecord.execute!(
				{ kind: 'contact', values: { email: 'not-an-email' } },
				options(context)
			)
		);

		expect(result.created).toBe(false);
		expect(result.issues).toEqual([
			'name: Name is required.',
			'email: Enter a valid email address.'
		]);
		expect(result.fields?.find((field) => field.name === 'name')?.required).toBe(true);
		expect(result.fields?.find((field) => field.name === 'status')?.options).toEqual([
			{ value: 'lead', label: 'Lead' },
			{ value: 'prospect', label: 'Prospect' },
			{ value: 'active', label: 'Active' },
			{ value: 'inactive', label: 'Inactive' }
		]);
		// Nothing was written, and no record came back to name.
		expect(result.record).toBeUndefined();
	});

	it('tells the model which fields exist when it invents one', async () => {
		const context = toolContext(orgContext());

		await expect(
			createRecord.execute!(
				{ kind: 'contact', values: { name: 'Dana', assigned_to: USER_ID } },
				options(context)
			)
		).rejects.toThrow(/A contact has no field named assigned_to\. Its fields are: name, title/);
	});

	it('writes every kind the form creates but a task, whose own door also assigns it', () => {
		// One door per kind, and a task's is createTask, because who is on a
		// task is part of creating it. A kind added to the registry is
		// creatable here by default, which is what this pins.
		expect([...CREATABLE_KINDS].sort()).toEqual(
			RECORD_TYPES.filter((type) => type !== 'task')
				.slice()
				.sort()
		);
		expect(CREATABLE_KINDS).not.toContain('task');
	});

	it('refuses a kind the caller may not manage before touching the database', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { contacts: 'read' } }));

		await expect(
			createRecord.execute!({ kind: 'contact', values: { name: 'Dana' } }, options(context))
		).rejects.toThrow(/does not allow "manage" on contacts/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});

describe('listRecordFields', () => {
	it('describes a form: what each field holds, what it insists on, and what it accepts', async () => {
		const context = toolContext(orgContext());

		const result = settled(await listRecordFields.execute!({ kind: 'company' }, options(context)));

		expect(result.kind).toBe('company');
		expect(result.fields.map((field) => field.name)).toEqual([
			'name',
			'relationship',
			'status',
			'email',
			'phone',
			'website'
		]);
		expect(result.fields[0]).toEqual({
			name: 'name',
			label: 'Name',
			type: 'text',
			required: true
		});
		// A company form points at no rows of the org's own, so nothing is read.
		expect(context.mock.from).not.toHaveBeenCalled();
	});

	it('carries the org’s own rows for a field whose choices are not records', async () => {
		// A deal's stages and the roster: the model cannot find either with
		// findRecords, so the form description is where they have to come from
		// — a stage labelled with the board it is on.
		const db = supabaseTablesMock({
			pipelines: {
				data: [
					{
						id: 'p1',
						name: 'Sales',
						pipeline_stages: [{ id: 's1', name: 'Qualified', sort_order: 1 }]
					}
				]
			},
			organization_members: {
				data: [
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
		const context: AssistantToolContext = {
			supabase: db.supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		const result = settled(await listRecordFields.execute!({ kind: 'deal' }, options(context)));

		expect(result.fields.find((field) => field.name === 'stage_id')?.options).toEqual([
			{ value: 's1', label: 'Qualified (Sales)' }
		]);
		// Assigning is a colleague, and they are not a record either.
		expect(result.fields.find((field) => field.name === 'assigned_to')?.options).toEqual([
			{ value: USER_ID, label: 'Alex Owner (alex@acme.test)' }
		]);
		// A party picker points at records, so it carries no options: its id
		// comes from findRecords.
		expect(result.fields.find((field) => field.name === 'company_id')?.options).toBeUndefined();
	});
});

describe('addNote', () => {
	it('logs an activity against any kind of record, not just a company', async () => {
		const note = { id: 'n1', created_at: '2026-09-14T10:00:00Z' };
		const context = toolContext(orgContext(), { data: note });

		const result = await addNote.execute!(
			{ kind: 'deal', id: COMPANY_ID, body: 'Left a voicemail.' },
			options(context)
		);

		expect(context.mock.from).toHaveBeenCalledWith('activities');
		expect(context.mock.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'note',
				body: 'Left a voicemail.',
				entity_type: 'deal',
				entity_id: COMPANY_ID,
				org_id: ORG_ID
			})
		);
		expect(result).toEqual({
			noteId: 'n1',
			kind: 'deal',
			recordId: COMPANY_ID,
			createdAt: '2026-09-14T10:00:00Z'
		});
	});

	it('checks the kind it names, not companies', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { companies: 'manage' } }));

		await expect(
			addNote.execute!({ kind: 'deal', id: COMPANY_ID, body: 'x' }, options(context))
		).rejects.toThrow(/does not allow "manage" on deals/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});
