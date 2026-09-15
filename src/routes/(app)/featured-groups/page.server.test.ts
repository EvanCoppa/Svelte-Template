import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The featured groups page from the outside: what it offers whom, and how a
 * post from the multi-select — one `product_ids` per pick, plus the blank the
 * picker posts when nothing is picked — becomes join rows. The quick plans
 * page's test, for the page that has the same shape.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['featured-groups', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['featured-groups', 'manage' as const]])
};

const GROUP_ID = 'c3000000-0000-0000-0000-000000000001';
const GLOVES = 'c4000000-0000-0000-0000-000000000001';
const MASKS = 'c4000000-0000-0000-0000-000000000002';

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId` and
	// `org.access`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access } } as never;
}

/** A plain form post, the way the page's forms post without JavaScript too. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/featured-groups', { method: 'POST', body });
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

describe('the featured groups load', () => {
	it('lists the groups and the live catalog, and says what the reader may do', async () => {
		const { supabase, builders } = supabaseTablesMock({
			featured_groups: { data: [{ id: GROUP_ID, name: 'Spring promo' }] },
			products: { data: [{ id: GLOVES, name: 'Nitrile gloves' }] }
		});

		// SAFETY: the load reads `locals` and calls `depends`; nothing else on the event.
		const data = await load({ locals: localsFor(supabase, READER), depends: vi.fn() } as never);
		if (!data) throw new Error('expected data');
		expect(data.featuredGroups).toEqual([{ id: GROUP_ID, name: 'Spring promo' }]);
		expect(builders.products?.eq).toHaveBeenCalledWith('is_active', true);
		expect(data.canManage).toBe(false);
		expect(data.canDelete).toBe(false);
		expect(data.createForm.data).toEqual({
			name: '',
			description: '',
			is_active: 'true',
			product_ids: []
		});
	});
});

describe('the featured groups actions', () => {
	it('refuses a reader, and a manager on the delete, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(
			run('create', supabase, READER, [
				['name', 'Spring promo'],
				['product_ids', GLOVES]
			])
		).rejects.toMatchObject({ status: 403 });
		await expect(run('remove', supabase, MANAGER, [['id', GROUP_ID]])).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('creates a group from the picks, dropping the blank the picker posts', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: GROUP_ID } },
			{ data: null }
		]);

		const result = await run('create', supabase, MANAGER, [
			['name', 'Spring promo'],
			['description', ''],
			['is_active', 'true'],
			['product_ids', ''],
			['product_ids', GLOVES],
			['product_ids', MASKS]
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'featured_groups');
		// A blank description is no description, not an empty string.
		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			name: 'Spring promo',
			description: null,
			is_active: true,
			org_id: ORG_ID
		});
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: GLOVES, sort_order: 0 },
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: MASKS, sort_order: 1 }
		]);
	});

	it('refuses a group with nothing picked, in a sentence', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('create', supabase, MANAGER, [
			['name', 'Empty shelf'],
			['product_ids', '']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.product_ids._errors', [
			'Pick at least one product to feature.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('replaces the members on update and deletes with evidence', async () => {
		const updated = supabaseMockSequence([
			{ data: { id: GROUP_ID } },
			{ data: null },
			{ data: null }
		]);
		await run('update', updated.supabase, MANAGER, [
			['id', GROUP_ID],
			['name', 'Summer promo'],
			['description', 'What is new in June'],
			['is_active', 'false'],
			['product_ids', MASKS]
		]);
		expect(updated.builder.update).toHaveBeenCalledWith({
			name: 'Summer promo',
			description: 'What is new in June',
			is_active: false
		});
		expect(updated.builder.delete).toHaveBeenCalled();
		expect(updated.builder.insert).toHaveBeenCalledWith([
			{ org_id: ORG_ID, featured_group_id: GROUP_ID, product_id: MASKS, sort_order: 0 }
		]);

		const removed = supabaseMockSequence([{ data: [] }]);
		const result = await run('remove', removed.supabase, OWNER, [['id', GROUP_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('was not deleted'));
	});
});
