import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './crm/test-support';
import {
	CREATE_FORM_ID,
	EDIT_FORM_ID,
	createRecord,
	isEditableRecordType,
	loadCreateRecord,
	loadEditRecord,
	updateRecord
} from './records';
import type { UserAccess } from './roles';
import type { RecordType } from '$lib/schemas/records';
import type { EditableRecordType } from './records';

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

const RECORD_ID = '40000000-0000-0000-0000-000000000001';

function save(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	type: EditableRecordType,
	fields: Record<string, string>
) {
	return updateRecord(
		{ request: post(fields), locals: localsFor(supabase, access) },
		type,
		RECORD_ID
	);
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

	it('writes a deal as a number, and an unpriced one as no amount at all', async () => {
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

		// Explicitly null rather than left out: the same mapping serves the edit
		// action, where an omitted column would mean "keep what was there" and a
		// cleared amount would silently not clear.
		const bare = supabaseMockSequence([{ data: board }, { data: { id: 'deal' } }]);
		await submit(bare.supabase, OWNER, 'deal', { title: 'Annual renewal' });
		expect(bare.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ amount: null, expected_close_date: null })
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

		// A blank price on a `not null default 0` column is the zero that default
		// would have given it — written out, so clearing one on an edit clears it.
		const typed = supabaseMock({ data: { id: 'billable' } });
		await submit(typed.supabase, OWNER, 'billable', { name: 'Porcelain crown' });
		expect(typed.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ unit_choices: null, is_featured: false, unit_price: 0 })
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

	it('writes an invoice draft, borrowing the company’s terms only when none were typed', async () => {
		const companyId = '20000000-0000-0000-0000-000000000001';
		const contactId = '30000000-0000-0000-0000-000000000001';

		const borrowed = supabaseMockSequence([
			{ data: { id: companyId, payment_terms_days: 45 } },
			{ data: { id: 'invoice' } }
		]);
		await submit(borrowed.supabase, OWNER, 'invoice', {
			company_id: companyId,
			contact_id: contactId,
			payment_terms_days: '',
			memo: 'September retainer'
		});
		expect(borrowed.from).toHaveBeenNthCalledWith(1, 'companies');
		expect(borrowed.from).toHaveBeenNthCalledWith(2, 'invoices');
		expect(borrowed.builder.insert).toHaveBeenCalledWith({
			company_id: companyId,
			contact_id: contactId,
			payment_terms_days: 45,
			due_date: null,
			billing_email: null,
			memo: 'September retainer',
			org_id: ORG_ID
		});

		const typed = supabaseMockSequence([
			{ data: { id: companyId, payment_terms_days: 45 } },
			{ data: { id: 'invoice' } }
		]);
		await submit(typed.supabase, OWNER, 'invoice', {
			company_id: companyId,
			payment_terms_days: '14'
		});
		expect(typed.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ company_id: companyId, contact_id: null, payment_terms_days: 14 })
		);

		// A person billed alone has no company to ask, so nothing is read first.
		const alone = supabaseMock({ data: { id: 'invoice' } });
		await submit(alone.supabase, OWNER, 'invoice', { contact_id: contactId });
		expect(alone.from).toHaveBeenCalledTimes(1);
		expect(alone.from).toHaveBeenCalledWith('invoices');
		expect(alone.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ company_id: null, contact_id: contactId, payment_terms_days: null })
		);
	});

	it('refuses an invoice that bills nobody, and writes nothing', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		const result = await submit(supabase, OWNER, 'invoice', { memo: 'To whom?' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.company_id', [
			'Pick a company or a person to bill.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMock({ error: { message: 'duplicate key value' } });

		const result = await submit(supabase, OWNER, 'product', { name: 'Standard install' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'duplicate key value');
	});
});

/**
 * The edit half: the same registry, the same schema and the same column
 * mapping as creating, so what is worth pinning here is the difference —
 * a form that opens filled in, an update rather than an insert, and a deal's
 * stage, which is the reason a record page has a form at all.
 */
describe('isEditableRecordType', () => {
	it('accepts the kinds the generic form writes', () => {
		expect(isEditableRecordType('deal')).toBe(true);
		expect(isEditableRecordType('company')).toBe(true);
	});

	it('refuses an invoice, which has its own lifecycle actions, and a proposal, which has a builder', () => {
		expect(isEditableRecordType('invoice')).toBe(false);
		expect(isEditableRecordType('proposal')).toBe(false);
	});
});

describe('loadEditRecord', () => {
	it('opens the form on what the record says now, under the edit id', async () => {
		const { supabase } = supabaseMock({
			data: {
				id: RECORD_ID,
				name: 'Sunrise Smoothie Bar',
				relationship: 'customer',
				status: 'active',
				email: null,
				phone: '+1 555 010 0100',
				website: null
			}
		});

		const { editForm, canEdit } = await loadEditRecord(
			localsFor(supabase, OWNER),
			'company',
			RECORD_ID
		);
		expect(canEdit).toBe(true);
		expect(editForm.id).toBe(EDIT_FORM_ID);
		// A null column is the blank string the form holds, never "null".
		expect(editForm.data).toMatchObject({
			name: 'Sunrise Smoothie Bar',
			phone: '+1 555 010 0100',
			email: '',
			website: ''
		});
		// What the record already says is not a list of mistakes.
		expect(editForm.errors).toEqual({});
	});

	it('reads nothing on behalf of a member who could not save it anyway', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		const { canEdit, editForm } = await loadEditRecord(
			localsFor(supabase, MEMBER),
			'company',
			RECORD_ID
		);
		expect(canEdit).toBe(false);
		expect(editForm.data).toMatchObject({ name: '' });
		expect(from).not.toHaveBeenCalled();
	});

	it('carries a deal to the form as the stage it sits in', async () => {
		const { supabase } = supabaseMockSequence([
			{
				data: {
					id: RECORD_ID,
					title: 'Sunrise Smoothie Bar — retail IC+',
					stage_id: '50000000-0000-0000-0000-000000000007',
					amount: 1800,
					expected_close_date: '2026-10-31'
				}
			},
			{ data: [] }
		]);

		const { editForm } = await loadEditRecord(localsFor(supabase, OWNER), 'deal', RECORD_ID);
		expect(editForm.data).toMatchObject({
			title: 'Sunrise Smoothie Bar — retail IC+',
			stage_id: '50000000-0000-0000-0000-000000000007',
			// Every field the form holds is a string, money included.
			amount: '1800',
			expected_close_date: '2026-10-31'
		});
	});
});

describe('updateRecord', () => {
	it('refuses a member without manage on the feature', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		await expect(save(supabase, MEMBER, 'company', { name: 'Acme' })).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('fails a bad post with the form, and writes nothing', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		const result = await save(supabase, OWNER, 'company', { name: '   ' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.valid', false);
		expect(from).not.toHaveBeenCalled();
	});

	it('updates the row rather than inserting one, and clears what was emptied', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: RECORD_ID } });

		await save(supabase, OWNER, 'company', {
			name: 'Sunrise Smoothie Bar',
			relationship: 'customer',
			status: 'active',
			email: '',
			phone: '+1 555 010 0100',
			website: ''
		});
		expect(from).toHaveBeenCalledWith('companies');
		expect(builder.insert).not.toHaveBeenCalled();
		expect(builder.update).toHaveBeenCalledWith({
			name: 'Sunrise Smoothie Bar',
			relationship: 'customer',
			status: 'active',
			email: null,
			phone: '+1 555 010 0100',
			website: null
		});
		expect(builder.eq).toHaveBeenCalledWith('id', RECORD_ID);
	});

	it('moves a deal by writing the stage AND the board it belongs to', async () => {
		const boards = [
			{
				id: '60000000-0000-0000-0000-000000000001',
				name: 'Merchant boarding',
				pipeline_stages: [{ id: '50000000-0000-0000-0000-000000000008' }]
			}
		];
		const { supabase, builder } = supabaseMockSequence([
			{ data: boards },
			{ data: { id: RECORD_ID } }
		]);

		await save(supabase, OWNER, 'deal', {
			title: 'Sunrise Smoothie Bar — retail IC+',
			stage_id: '50000000-0000-0000-0000-000000000008'
		});
		// A stage only means something inside its own pipeline, so the pair
		// moves together — never the stage alone.
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({
				stage_id: '50000000-0000-0000-0000-000000000008',
				pipeline_id: '60000000-0000-0000-0000-000000000001'
			})
		);
	});

	it('leaves a deal where it is when no stage is picked', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: RECORD_ID } });

		await save(supabase, OWNER, 'deal', { title: 'Renamed, not moved' });
		const [values] = builder.update.mock.calls[0];
		expect(values).not.toHaveProperty('stage_id');
		expect(values).not.toHaveProperty('pipeline_id');
	});

	it('refuses a stage on none of this org\u2019s boards, and writes nothing', async () => {
		// RLS is what makes this a refusal rather than a check: another org's
		// board simply is not in the list this org can read.
		const { supabase, builder } = supabaseMockSequence([{ data: [] }]);

		const result = await save(supabase, OWNER, 'deal', {
			title: 'Sunrise Smoothie Bar — retail IC+',
			stage_id: '99999999-0000-0000-0000-000000000009'
		});
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			'That stage is not on any board in this organization.'
		);
		expect(builder.update).not.toHaveBeenCalled();
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMock({
			error: { message: 'new row violates row-level security' }
		});

		const result = await save(supabase, OWNER, 'ticket', { subject: 'Terminal offline' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'new row violates row-level security');
	});
});
