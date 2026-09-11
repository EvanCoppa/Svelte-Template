import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './crm/test-support';
import { CREATE_FORM_ID, createRecord, loadCreateRecord } from './records';
import type { UserAccess } from './roles';
import type { RecordType } from '$lib/schemas/records';

/**
 * The generic create action, from the outside: what it refuses, what it
 * writes, and how a database failure comes back. The per-type column mapping
 * is the part worth pinning — it is the one place a form's strings become a
 * row.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const MEMBER: UserAccess = { role: 'member', roles: [], grants: new Map() };
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['companies', 'manage' as const]])
};

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the record helpers only read `supabase`, `activeOrgId` and
	// `org.access`; the rest of App.Locals is never touched here.
	return { supabase, activeOrgId: ORG_ID, org: { access } } as never;
}

function post(fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	// superValidate checks `data instanceof Request`, so this has to be real.
	return new Request('https://app.test/records', { method: 'POST', body });
}

function submit(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	type: RecordType,
	fields: Record<string, string>
) {
	return createRecord({ request: post(fields), locals: localsFor(supabase, access) }, type);
}

describe('loadCreateRecord', () => {
	it('hands the page an empty form under the shared id', async () => {
		const { supabase } = supabaseMock();

		const { createForm } = await loadCreateRecord(localsFor(supabase, OWNER), 'company');
		expect(createForm.id).toBe(CREATE_FORM_ID);
		expect(createForm.data).toMatchObject({ name: '', relationship: 'customer' });
	});

	it('offers the button only to a user who may write the feature', async () => {
		const { supabase } = supabaseMock();

		await expect(loadCreateRecord(localsFor(supabase, OWNER), 'company')).resolves.toMatchObject({
			canCreate: true
		});
		await expect(loadCreateRecord(localsFor(supabase, MANAGER), 'company')).resolves.toMatchObject({
			canCreate: true
		});
		await expect(loadCreateRecord(localsFor(supabase, MEMBER), 'company')).resolves.toMatchObject({
			canCreate: false
		});
	});
});

describe('createRecord', () => {
	it('refuses a member without manage on the feature', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		await expect(submit(supabase, MEMBER, 'company', { name: 'Acme' })).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('fails a bad post with the form, and writes nothing', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		const result = await submit(supabase, OWNER, 'company', { name: '   ' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.valid', false);
		expect(result).toHaveProperty('data.form.errors.name');
		expect(from).not.toHaveBeenCalled();
	});

	it('writes a company, turning untouched fields into null columns', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: 'new' } });

		await submit(supabase, OWNER, 'company', {
			name: 'Acme Corporation',
			relationship: 'supplier',
			status: 'active',
			email: '  hello@acme.com  ',
			phone: '',
			website: ''
		});

		expect(from).toHaveBeenCalledWith('companies');
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'Acme Corporation',
			relationship: 'supplier',
			status: 'active',
			email: 'hello@acme.com',
			phone: null,
			website: null,
			org_id: ORG_ID
		});
	});

	it('writes a deal as a number, leaving an unpriced one to the column default', async () => {
		const board = { id: 'pipeline-1', pipeline_stages: [{ id: 'stage-1' }] };
		const priced = supabaseMockSequence([{ data: board }, { data: { id: 'deal' } }]);

		await submit(priced.supabase, OWNER, 'deal', {
			title: 'Annual renewal',
			amount: '1200.50',
			expected_close_date: '2026-09-30'
		});
		expect(priced.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 1200.5, expected_close_date: '2026-09-30' })
		);

		const bare = supabaseMockSequence([{ data: board }, { data: { id: 'deal' } }]);
		await submit(bare.supabase, OWNER, 'deal', { title: 'Annual renewal' });
		expect(bare.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ amount: undefined, expected_close_date: null })
		);
	});

	it('stores a due date as an instant, reading a naive pick as UTC', async () => {
		const naive = supabaseMock({ data: { id: 'task' } });
		await submit(naive.supabase, OWNER, 'task', {
			title: 'Call back',
			due_at: '2026-09-10T17:00'
		});
		expect(naive.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ due_at: '2026-09-10T17:00:00.000Z' })
		);

		// What the browser posts once it has applied the viewer's offset.
		const offset = supabaseMock({ data: { id: 'task' } });
		await submit(offset.supabase, OWNER, 'task', {
			title: 'Call back',
			due_at: '2026-09-11T00:00:00.000Z'
		});
		expect(offset.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ due_at: '2026-09-11T00:00:00.000Z' })
		);
	});

	it('writes a billable, splitting its unit choices and reading the featured pick as a boolean', async () => {
		const chips = supabaseMock({ data: { id: 'billable' } });
		await submit(chips.supabase, OWNER, 'billable', {
			name: 'Scaling and root planing',
			code: 'D4341',
			unit_price: '275',
			unit: 'quadrant',
			unit_choices: 'UR, UL,, BR , BL',
			is_featured: 'true'
		});
		expect(chips.from).toHaveBeenCalledWith('billables');
		expect(chips.builder.insert).toHaveBeenCalledWith({
			name: 'Scaling and root planing',
			code: 'D4341',
			unit_price: 275,
			unit: 'quadrant',
			unit_choices: ['UR', 'UL', 'BR', 'BL'],
			is_featured: true,
			description: null,
			org_id: ORG_ID
		});

		const typed = supabaseMock({ data: { id: 'billable' } });
		await submit(typed.supabase, OWNER, 'billable', { name: 'Porcelain crown' });
		expect(typed.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ unit_choices: null, is_featured: false, unit_price: undefined })
		);
	});

	it('writes an asset with its own columns only: no owner, no vendor, no assignee', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: 'f1' } });

		await submit(supabase, OWNER, 'asset', {
			name: 'MacBook Pro',
			asset_type: 'device',
			identifier: 'IT-001',
			status: 'retired',
			acquired_on: '2026-01-15',
			purchase_price: '2399'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			name: 'MacBook Pro',
			asset_type: 'device',
			identifier: 'IT-001',
			status: 'retired',
			acquired_on: '2026-01-15',
			purchase_price: 2399,
			description: null,
			org_id: ORG_ID
		});
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMock({ error: { message: 'duplicate key value' } });

		const result = await submit(supabase, OWNER, 'product', { name: 'Standard install' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'duplicate key value');
	});
});
