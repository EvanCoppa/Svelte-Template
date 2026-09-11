import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { requireSystemAdmin } from './guard';
import { supabaseMock } from '../crm/test-support';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000003';
// SAFETY: the guard reads `id` only; the rest of User is never touched.
const USER: User = { id: OPERATOR_ID, email: 'operator@example.test' } as never;

function harness(result: Parameters<typeof supabaseMock>[0], user: User | null = USER) {
	const mock = supabaseMock(result);
	return { ...mock, locals: { supabase: mock.supabase, user } };
}

describe('requireSystemAdmin', () => {
	it('returns the operator when their system_admins row exists', async () => {
		const h = harness({ data: { user_id: OPERATOR_ID } });

		await expect(requireSystemAdmin(h.locals)).resolves.toBe(USER);
		expect(h.from).toHaveBeenCalledWith('system_admins');
		expect(h.builder.eq).toHaveBeenCalledWith('user_id', OPERATOR_ID);
	});

	it('refuses a signed-in user who is not an operator with 404, not 403', async () => {
		// A refusal that confirms the page is real would tell every tenant user
		// where the platform console lives — the same reasoning a hidden
		// feature's 404 rests on.
		const h = harness({ data: null });

		await expect(requireSystemAdmin(h.locals)).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
	});

	it('refuses a request with no user at all', async () => {
		// The hook already turned anonymous requests away; this is the second lock.
		const h = harness({ data: { user_id: OPERATOR_ID } }, null);

		await expect(requireSystemAdmin(h.locals)).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 404
		);
		expect(h.from).not.toHaveBeenCalled();
	});

	it('fails closed when the lookup itself fails', async () => {
		// A broken database must look broken, never like "not an operator" —
		// and never like "operator".
		const h = harness({ error: { message: 'permission denied' } });

		await expect(requireSystemAdmin(h.locals)).rejects.toThrow('permission denied');
	});
});
