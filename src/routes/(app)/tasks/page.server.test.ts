import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The tasks page from the outside: what a reader and a writer are handed,
 * and how the task modal's post becomes a row and its assignments.
 */

const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['tasks', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['tasks', 'manage' as const],
		['companies', 'read' as const],
		['contacts', 'read' as const]
	])
};

const USER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000002';
const TASK_ID = 'a0000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

/** A registry with contacts hidden from this org, so the record gate has something to refuse. */
const HIDDEN_CONTACTS: FeatureMap = {
	contacts: {
		mode: 'hidden',
		// SAFETY: the gate reads `id` and `route`; the rest of the row is never touched.
		feature: { id: 'contacts', route: '/contacts' } as never
	}
};

function localsFor(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	features: FeatureMap = {}
): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId`, `user.id`,
	// `org.access` and `org.features`; the rest of App.Locals is never touched.
	return {
		supabase,
		activeOrgId: ORG_ID,
		user: { id: USER_ID },
		org: { access, features }
	} as never;
}

/** A plain form post, the way the modal posts without JavaScript too. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/tasks', { method: 'POST', body });
}

function create(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][],
	features?: FeatureMap
) {
	// SAFETY: the action reads `request` and `locals` only.
	return actions.create({
		request: post(fields),
		locals: localsFor(supabase, access, features)
	} as never);
}

async function runLoad(supabase: SupabaseClient<Database>, access: UserAccess) {
	// SAFETY: the load reads `locals` and calls `depends`; nothing else on the event.
	const data = await load({ locals: localsFor(supabase, access), depends: vi.fn() } as never);
	if (!data) throw new Error('expected data');
	return data;
}

const PICKERS = {
	companies: { data: [{ id: COMPANY_ID, name: 'Acme' }] },
	contacts: { data: [{ id: CONTACT_ID, name: 'Dana Reyes', companies: null }] }
};

/** A store with no tasks yet and the two pickers' rows. */
function emptyBoard() {
	return supabaseTablesMock({
		tasks: { data: [] },
		organization_members: { data: [] },
		...PICKERS
	});
}

/** A store where the insert comes back as the row the modal's post described. */
function stack() {
	return supabaseTablesMock({
		tasks: { data: { id: TASK_ID, title: 'Send the introductory email' } },
		relationships: { data: { id: 'r0000000-0000-0000-0000-000000000001' } },
		...PICKERS
	});
}

describe('the tasks load', () => {
	it('hands a writer the modal, the roster and the records it may link', async () => {
		const { supabase, from } = emptyBoard();
		const data = await runLoad(supabase, MANAGER);

		expect(data.canCreate).toBe(true);
		expect(data.currentUserId).toBe(USER_ID);
		expect(data.createForm.data).toEqual({ title: '', due_at: '', assignees: [], record: '' });
		expect(data.records).toEqual([
			{ kind: 'company', id: COMPANY_ID, name: 'Acme' },
			{ kind: 'contact', id: CONTACT_ID, name: 'Dana Reyes' }
		]);
		expect(from).toHaveBeenCalledWith('companies');
		expect(from).toHaveBeenCalledWith('contacts');
	});

	it('reads no pickers for a reader, who has no modal to open', async () => {
		const { supabase, from } = emptyBoard();
		const data = await runLoad(supabase, READER);

		expect(data.canCreate).toBe(false);
		expect(data.records).toEqual([]);
		expect(from).not.toHaveBeenCalledWith('companies');
		expect(from).not.toHaveBeenCalledWith('contacts');
	});
});

describe('the create action', () => {
	it('writes the row, then one assignment per person named', async () => {
		const { supabase, builders } = stack();
		const result = await create(supabase, MANAGER, [
			['title', 'Send the introductory email'],
			['due_at', '2026-09-14T22:59:59.999Z'],
			['assignees', USER_ID],
			['assignees', OTHER_ID],
			// A second copy of the same person is one assignment, not a refusal.
			['assignees', OTHER_ID],
			['record', `company:${COMPANY_ID}`]
		]);

		expect(result).toEqual({ form: expect.objectContaining({ valid: true }) });
		expect(builders.tasks?.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			title: 'Send the introductory email',
			due_at: '2026-09-14T22:59:59.999Z',
			company_id: COMPANY_ID,
			contact_id: null
		});
		expect(builders.relationships?.insert).toHaveBeenCalledTimes(2);
		expect(builders.relationships?.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				from_type: 'task',
				from_id: TASK_ID,
				to_type: 'member',
				to_id: OTHER_ID
			})
		);
	});

	it('links a person as the contact and nothing as nobody', async () => {
		const { supabase, builders } = stack();
		await create(supabase, MANAGER, [
			['title', 'Call back'],
			['record', `contact:${CONTACT_ID}`]
		]);
		expect(builders.tasks?.insert).toHaveBeenCalledWith(
			expect.objectContaining({ company_id: null, contact_id: CONTACT_ID, due_at: null })
		);
		expect(builders.relationships?.insert).not.toHaveBeenCalled();
	});

	it('refuses a blank title without touching the store', async () => {
		const { supabase, from } = stack();
		const result = await create(supabase, MANAGER, [['title', '   ']]);
		expect(result).toMatchObject({ status: 400 });
		expect(from).not.toHaveBeenCalled();
	});

	it('refuses a record of a kind the caller cannot open', async () => {
		const { supabase, from } = stack();
		const result = await create(
			supabase,
			MANAGER,
			[
				['title', 'Call back'],
				['record', `contact:${CONTACT_ID}`]
			],
			HIDDEN_CONTACTS
		);
		expect(result).toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('refuses a reader', async () => {
		const { supabase } = stack();
		await expect(create(supabase, READER, [['title', 'Call back']])).rejects.toMatchObject({
			status: 403
		});
	});

	it('hands the database refusal back as the form message', async () => {
		const { supabase } = supabaseTablesMock({
			tasks: { error: { message: 'new row violates row-level security policy' } }
		});
		const result = await create(supabase, MANAGER, [['title', 'Call back']]);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: 'new row violates row-level security policy' } }
		});
	});
});
