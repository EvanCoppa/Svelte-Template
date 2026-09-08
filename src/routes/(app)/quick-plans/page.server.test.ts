import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The bundles page from the outside: what it offers whom, and how a post
 * from the multi-select — one `billable_ids` per pick, plus the blank the
 * picker posts when nothing is picked — becomes join rows.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['quick-plans', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['quick-plans', 'manage' as const]])
};

const PLAN_ID = 'c2000000-0000-0000-0000-000000000001';
const CROWN = 'c1000000-0000-0000-0000-000000000001';
const WHITENING = 'c1000000-0000-0000-0000-000000000002';

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId` and
	// `org.access`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access } } as never;
}

/** A plain form post, the way the page's forms post without JavaScript too. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/quick-plans', { method: 'POST', body });
}

type ActionName = keyof typeof actions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][]
) {
	// SAFETY: the actions read `request` and `locals` only.
	return actions[name]({ request: post(fields), locals: localsFor(supabase, access) } as never);
}

describe('the quick plans load', () => {
	it('lists the bundles and the live schedule, and says what the reader may do', async () => {
		const { supabase, builders } = supabaseTablesMock({
			quick_plans: { data: [{ id: PLAN_ID, name: 'Crown and whitening' }] },
			billables: { data: [{ id: CROWN, name: 'Porcelain crown' }] }
		});

		// SAFETY: the load reads `locals` and calls `depends`; nothing else on the event.
		const data = await load({ locals: localsFor(supabase, READER), depends: vi.fn() } as never);
		if (!data) throw new Error('expected data');
		expect(data.quickPlans).toEqual([{ id: PLAN_ID, name: 'Crown and whitening' }]);
		expect(builders.billables?.eq).toHaveBeenCalledWith('is_active', true);
		expect(data.canManage).toBe(false);
		expect(data.canDelete).toBe(false);
		expect(data.createForm.data).toEqual({ name: '', billable_ids: [] });
	});
});

describe('the quick plans actions', () => {
	it('refuses a reader, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(
			run('create', supabase, READER, [
				['name', 'Hygiene visit'],
				['billable_ids', CROWN]
			])
		).rejects.toMatchObject({ status: 403 });
		await expect(run('remove', supabase, MANAGER, [['id', PLAN_ID]])).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('creates a bundle from the picks, dropping the blank the picker posts', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: PLAN_ID } },
			{ data: null }
		]);

		const result = await run('create', supabase, MANAGER, [
			['name', 'Hygiene visit'],
			['billable_ids', ''],
			['billable_ids', CROWN],
			['billable_ids', WHITENING]
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'quick_plans');
		expect(builder.insert).toHaveBeenNthCalledWith(1, { name: 'Hygiene visit', org_id: ORG_ID });
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: CROWN, sort_order: 0 },
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: WHITENING, sort_order: 1 }
		]);
	});

	it('refuses a bundle with nothing picked, in a sentence', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('create', supabase, MANAGER, [
			['name', 'Empty'],
			['billable_ids', '']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.billable_ids._errors', [
			'Pick at least one to bundle.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('replaces the members on update and deletes with evidence', async () => {
		const updated = supabaseMockSequence([
			{ data: { id: PLAN_ID } },
			{ data: null },
			{ data: null }
		]);
		await run('update', updated.supabase, MANAGER, [
			['id', PLAN_ID],
			['name', 'Hygiene visit'],
			['billable_ids', WHITENING]
		]);
		expect(updated.builder.update).toHaveBeenCalledWith({ name: 'Hygiene visit' });
		expect(updated.builder.delete).toHaveBeenCalled();
		expect(updated.builder.insert).toHaveBeenCalledWith([
			{ org_id: ORG_ID, quick_plan_id: PLAN_ID, billable_id: WHITENING, sort_order: 0 }
		]);

		const removed = supabaseMockSequence([{ data: [] }]);
		const result = await run('remove', removed.supabase, OWNER, [['id', PLAN_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('was not deleted'));
	});
});
