import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';

/**
 * What this file covers is what the route decides before any database work:
 * that neither entry point does anything at all for a visitor without a
 * session. Everything past that guard is tested where its dependencies are
 * injectable rather than mocked — `lookupInvite`, `acceptInvite` and
 * `acceptanceFor` in `src/lib/server/staff.test.ts` — which is why the route
 * holds no branching logic of its own beyond calling them.
 */

const USER = { id: '00000000-0000-0000-0000-000000000002', email: 'invitee@example.com' };

function harness({ user = USER }: { user?: typeof USER | null } = {}) {
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	return {
		cookies,
		loadEvent: { locals: { user }, params: { token: 'tok123' } },
		// superValidate demands a real Request — a duck-typed mock is treated as
		// plain data instead of being parsed as a form post.
		actionEvent: () => ({
			cookies,
			locals: { user },
			params: { token: 'tok123' },
			request: new Request('https://app.test/invite/tok123', {
				method: 'POST',
				body: new FormData()
			})
		})
	};
}

type Stub = ReturnType<typeof harness>;

/** `load` wants a full ServerLoadEvent; the stub covers what it reads. */
function runLoad(event: Stub['loadEvent']) {
	// SAFETY: the stub carries the locals and params the load reads; the rest
	// of ServerLoadEvent is irrelevant to it.
	return load(event as never);
}

function accept(event: ReturnType<Stub['actionEvent']>) {
	const action = actions['accept'];
	if (!action) throw new Error('invite route has no accept action');
	// SAFETY: same — the stub carries cookies, locals, params and a real
	// Request, which is everything the action touches.
	return action(event as never);
}

describe('load', () => {
	it('redirects a signed-out visitor to login', async () => {
		const { loadEvent } = harness({ user: null });

		// The hook would normally have caught this first; the load re-checks so
		// the route stays private even if PUBLIC_PATHS is edited carelessly.
		await expect(runLoad(loadEvent)).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
	});
});

describe('accept', () => {
	it('redirects a signed-out poster to login before touching anything', async () => {
		const { actionEvent, cookies } = harness({ user: null });

		await expect(accept(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(cookies.set).not.toHaveBeenCalled();
	});
});
