import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_ORG_COOKIE } from '$lib/server/active-org';
import { PUT } from './+server';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const USER_ID = '20000000-0000-0000-0000-000000000001';

/** The organizations row RLS hands back — null when the caller may not act in it. */
type OrgRow = { id: string } | null;

function event(body: string, org: OrgRow) {
	const maybeSingle = vi.fn(async () => ({ data: org, error: null }));
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle
	};
	const from = vi.fn(() => query);
	const cookies = { set: vi.fn() };
	return {
		request: new Request('http://localhost/api/org', { method: 'PUT', body }),
		locals: {
			user: { id: USER_ID },
			supabase: { from }
		},
		cookies,
		from,
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
		expect(await status(event('not json', { id: ORG_ID }))).toBe(400);
	});

	it('rejects a body whose orgId is not a UUID', async () => {
		expect(await status(event(JSON.stringify({ orgId: 'nope' }), { id: ORG_ID }))).toBe(400);
		expect(await status(event(JSON.stringify({}), { id: ORG_ID }))).toBe(400);
	});

	it('403s when RLS shows the caller no such organization', async () => {
		const e = event(JSON.stringify({ orgId: ORG_ID }), null);
		expect(await status(e)).toBe(403);
		expect(e.cookies.set).not.toHaveBeenCalled();
	});

	it('sets the cookie and returns 204 for an organization the caller may act in', async () => {
		const e = event(JSON.stringify({ orgId: ORG_ID }), { id: ORG_ID });
		const response = await callPut(e);

		expect(response.status).toBe(204);
		expect(e.cookies.set).toHaveBeenCalledWith(ACTIVE_ORG_COOKIE, ORG_ID, expect.any(Object));
		// Access was checked as the caller against organizations, whose policy
		// answers for members and system admins alike — never a membership row,
		// which an operator opening a foreign org does not have.
		expect(e.from).toHaveBeenCalledWith('organizations');
		expect(e.query.eq).toHaveBeenCalledWith('id', ORG_ID);
		expect(e.query.maybeSingle).toHaveBeenCalled();
	});
});
