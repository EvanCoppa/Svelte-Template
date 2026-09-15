import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions } from './+page.server';

/**
 * The `setPay` action from the outside: who may post it and what a blank
 * field does to a figure that was already set. RLS backs the same boundary
 * independently (staff_compensation migration) — this proves the action
 * agrees with it rather than offering the button to someone it would refuse.
 */

const USER_ID = '00000000-0000-0000-0000-000000000002';

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const MEMBER: UserAccess = { role: 'member', roles: [], grants: new Map() };

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: setPay only reads `supabase` and `org.activeOrg` / `org.access`.
	return {
		supabase,
		user: { id: USER_ID, email: 'owner@example.com' },
		org: { activeOrg: { id: ORG_ID, name: 'Acme Inc', industryId: 'crm' }, access }
	} as never;
}

function formData(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

function requestFor(fields: Record<string, string>): Request {
	return new Request('https://app.test/staff?/setPay', { method: 'POST', body: formData(fields) });
}

describe('setPay action', () => {
	it('refuses a plain member, RLS-shaped, before touching the database', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		// SAFETY: setPay only reads `locals` and `request` off the action event.
		const result = await actions.setPay({
			locals: localsFor(supabase, MEMBER),
			request: requestFor({ user_id: USER_ID, hourly_wage: '20', commission_percent: '' })
		} as never);

		expect(builder.upsert).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			data: { form: { message: 'Only owners and admins can set pay.' } }
		});
	});

	it('lets an owner set both figures', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		// SAFETY: setPay only reads `locals` and `request` off the action event.
		const result = await actions.setPay({
			locals: localsFor(supabase, OWNER),
			request: requestFor({ user_id: USER_ID, hourly_wage: '22.5', commission_percent: '4' })
		} as never);

		expect(builder.upsert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			user_id: USER_ID,
			hourly_wage: 22.5,
			commission_percent: 4
		});
		expect(result).not.toHaveProperty('status');
	});

	it('clears a figure left blank instead of keeping the old value', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		// SAFETY: setPay only reads `locals` and `request` off the action event.
		await actions.setPay({
			locals: localsFor(supabase, OWNER),
			request: requestFor({ user_id: USER_ID, hourly_wage: '', commission_percent: '' })
		} as never);

		expect(builder.upsert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			user_id: USER_ID,
			hourly_wage: null,
			commission_percent: null
		});
	});

	it('rejects a malformed figure before it reaches the database', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		// SAFETY: setPay only reads `locals` and `request` off the action event.
		const result = await actions.setPay({
			locals: localsFor(supabase, OWNER),
			request: requestFor({ user_id: USER_ID, hourly_wage: 'lots', commission_percent: '' })
		} as never);

		expect(builder.upsert).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});
});
