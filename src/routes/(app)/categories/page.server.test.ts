import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMock, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The categories page from the outside. The interesting thing here is that
 * managing the tree is gated TWICE — the feature grant and the org role — so
 * the tests that matter are the ones about who is refused: the
 * `product_categories` policies are owner/admin, and a member holding
 * `manage` on the feature must be told that rather than hitting RLS.
 */

const CATEGORY_ID = 'b1000000-0000-0000-0000-000000000001';

/** An owner who also holds the grant: the only one who may manage the tree. */
const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
/** An admin, same answer. */
const ADMIN: UserAccess = { role: 'admin', roles: [], grants: new Map() };
/**
 * A member holding `delete` on the feature — refused anyway, because the
 * table's policies are owner/admin. This is the case the double answer
 * exists for, and the only one where the role and the grant disagree: an
 * owner or an admin bypasses grants entirely (`hasGrant()`), so there is no
 * such thing as an owner who only holds read.
 */
const MEMBER_WITH_GRANT: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['categories', 'delete' as const]])
};
function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId`,
	// `org.access` and `org.activeOrg.role`; nothing else on App.Locals.
	return {
		supabase,
		activeOrgId: ORG_ID,
		org: { access, activeOrg: { role: access.role } }
	} as never;
}

function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/categories', { method: 'POST', body });
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

describe('the categories load', () => {
	it('reads the whole tree and says what this reader may do', async () => {
		const { supabase } = supabaseTablesMock({
			product_categories: { data: [{ id: CATEGORY_ID, name: 'Materials', products: [] }] }
		});

		// SAFETY: the load reads `locals` and calls `depends`.
		const data = await load({ locals: localsFor(supabase, OWNER), depends: vi.fn() } as never);
		if (!data) throw new Error('expected data');
		expect(data.categories).toHaveLength(1);
		expect(data.canManage).toBe(true);
	});

	it('offers nothing to a member, whatever the feature grant says', async () => {
		const { supabase } = supabaseTablesMock({ product_categories: { data: [] } });

		// SAFETY: the load reads `locals` and calls `depends`.
		const data = await load({
			locals: localsFor(supabase, MEMBER_WITH_GRANT),
			depends: vi.fn()
		} as never);
		if (!data) throw new Error('expected data');
		// The `product_categories` policies are owner/admin, so no grant a
		// member can hold would get the write past RLS — the buttons are not
		// offered rather than offered and refused.
		expect(data.canManage).toBe(false);
	});
});

describe('the categories actions', () => {
	it('refuses a member holding the grant, and writes nothing', async () => {
		const { supabase, from } = supabaseMock({ data: {} });

		await expect(
			run('create', supabase, MEMBER_WITH_GRANT, [
				['name', 'Fixings'],
				['parent_id', ''],
				['sort_order', ''],
				['description', '']
			])
		).rejects.toMatchObject({ status: 403 });
		await expect(
			run('remove', supabase, MEMBER_WITH_GRANT, [['id', CATEGORY_ID]])
		).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('creates a root when no parent is picked, and a child when one is', async () => {
		const root = supabaseMock({ data: { id: CATEGORY_ID } });
		await run('create', root.supabase, ADMIN, [
			['name', 'Materials'],
			['parent_id', ''],
			['sort_order', ''],
			['description', '']
		]);
		// A blank picker is no parent and a blank position is the end of the
		// list — never the empty strings the form posted.
		expect(root.builder.insert).toHaveBeenCalledWith({
			name: 'Materials',
			description: null,
			parent_id: null,
			sort_order: 0,
			org_id: ORG_ID
		});

		const child = supabaseMock({ data: { id: 'child' } });
		await run('create', child.supabase, OWNER, [
			['name', 'Fixings'],
			['parent_id', CATEGORY_ID],
			['sort_order', '200'],
			['description', 'Screws and bolts']
		]);
		expect(child.builder.insert).toHaveBeenCalledWith({
			name: 'Fixings',
			description: 'Screws and bolts',
			parent_id: CATEGORY_ID,
			sort_order: 200,
			org_id: ORG_ID
		});
	});

	it('reports a refusal from the database in the form rather than as a 500', async () => {
		// Moving a category under its own descendant is refused by a trigger.
		const { supabase } = supabaseMock({
			error: { message: 'A category cannot be its own ancestor.' }
		});

		const result = await run('update', supabase, OWNER, [
			['id', CATEGORY_ID],
			['name', 'Materials'],
			['parent_id', 'b1000000-0000-0000-0000-000000000002'],
			['sort_order', ''],
			['description', '']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'A category cannot be its own ancestor.');
	});

	it('deletes with evidence, and reports a row RLS filtered out', async () => {
		const removed = supabaseMock({ data: [] });
		const result = await run('remove', removed.supabase, OWNER, [['id', CATEGORY_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('was not deleted'));
	});
});
