import { describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { supabaseMock } from './crm/test-support';
import { isPlatformOperator, requireOperator } from './operator';

const USER_ID = '00000000-0000-0000-0000-000000000003';
// SAFETY: the gate reads `id` only; the rest of User is irrelevant to it.
const user = { id: USER_ID, email: 'evancoppa@gmail.com' } as User;

describe('isPlatformOperator', () => {
	it('is true when the user has an operator row', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [{ user_id: USER_ID }] });
		expect(await isPlatformOperator(supabase, USER_ID)).toBe(true);
		expect(from).toHaveBeenCalledWith('platform_operators');
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
	});

	it('is false when no row comes back', async () => {
		const { supabase } = supabaseMock({ data: [] });
		expect(await isPlatformOperator(supabase, USER_ID)).toBe(false);
	});

	it('throws on a query error rather than failing open', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });
		await expect(isPlatformOperator(supabase, USER_ID)).rejects.toThrow('boom');
	});
});

describe('requireOperator', () => {
	it('sends a signed-out request to login', async () => {
		const { supabase } = supabaseMock({ data: [] });
		await expect(requireOperator({ supabase, user: null })).rejects.toSatisfy(
			(e) => isRedirect(e) && e.location === '/login'
		);
	});

	it('answers 404 to a signed-in non-operator, never confirming the console exists', async () => {
		const { supabase } = supabaseMock({ data: [] });
		const createAdminClient = vi.fn();
		await expect(requireOperator({ supabase, user }, { createAdminClient })).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 404
		);
		expect(createAdminClient).not.toHaveBeenCalled();
	});

	it('hands an operator the service-role client', async () => {
		const { supabase } = supabaseMock({ data: [{ user_id: USER_ID }] });
		const admin = supabaseMock().supabase;
		const createAdminClient = vi.fn(() => admin);
		expect(await requireOperator({ supabase, user }, { createAdminClient })).toBe(admin);
	});

	it('turns a missing service-role key into a 500 with a readable message', async () => {
		const { supabase } = supabaseMock({ data: [{ user_id: USER_ID }] });
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const createAdminClient = vi.fn(() => {
			throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set');
		});
		await expect(requireOperator({ supabase, user }, { createAdminClient })).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 500
		);
	});
});
