import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_ORG_COOKIE } from '$lib/server/active-org';
import { PUT } from './+server';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const USER_ID = '20000000-0000-0000-0000-000000000001';

type MembershipRow = { org_id: string } | null;

function event(body: string, membership: MembershipRow) {
	const maybeSingle = vi.fn(async () => ({ data: membership, error: null }));
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle
	};
	const cookies = { set: vi.fn() };
	return {
		request: new Request('http://localhost/api/org', { method: 'PUT', body }),
		locals: {
			user: { id: USER_ID },
			supabase: { from: vi.fn(() => query) }
		},
		cookies,
		query
	};
}

async function callPut(e: ReturnType<typeof event>) {
	// SAFETY: the stub event carries every field the handler reads (request,
	// locals.user, locals.supabase, cookies); the rest of RequestEvent is unused.
	return PUT(e as never);
}

async function status(e: ReturnType<typeof event>): Promise<number> {
	try {
		const response = await callPut(e);
		return response.status;
	} catch (err) {
		// SAFETY: the handler only throws SvelteKit's error(), whose HttpError
		// always carries a numeric status.
		return (err as { status: number }).status;
	}
}

describe('PUT /api/org', () => {
	it('rejects a non-JSON body', async () => {
		expect(await status(event('not json', { org_id: ORG_ID }))).toBe(400);
	});

	it('rejects a body whose orgId is not a UUID', async () => {
		expect(await status(event(JSON.stringify({ orgId: 'nope' }), { org_id: ORG_ID }))).toBe(400);
		expect(await status(event(JSON.stringify({}), { org_id: ORG_ID }))).toBe(400);
	});

	it('403s when the caller is not a member of the organization', async () => {
		const e = event(JSON.stringify({ orgId: ORG_ID }), null);
		expect(await status(e)).toBe(403);
		expect(e.cookies.set).not.toHaveBeenCalled();
	});

	it('sets the cookie and returns 204 for a member', async () => {
		const e = event(JSON.stringify({ orgId: ORG_ID }), { org_id: ORG_ID });
		const response = await callPut(e);

		expect(response.status).toBe(204);
		expect(e.cookies.set).toHaveBeenCalledWith(ACTIVE_ORG_COOKIE, ORG_ID, expect.any(Object));
		// Membership was checked as the caller, scoped to both org and user.
		expect(e.query.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(e.query.eq).toHaveBeenCalledWith('user_id', USER_ID);
	});
});
