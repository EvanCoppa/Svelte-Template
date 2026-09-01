import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { setActiveOrg } from '$lib/server/active-org';
import type { RequestHandler } from './$types';

/**
 * Switch the active organization. A `+server.ts` endpoint (not a form action)
 * because the team switcher triggers it from the persistent sidebar on every
 * page — CLAUDE.md's cross-page-mutation exception. The hook already 401s
 * unauthenticated `/api/*` callers.
 */
// z.guid(), not z.uuid(): Postgres uuids (and the seed's fixed ids) are any
// 8-4-4-4-12 hex value, while z.uuid() enforces strict RFC 4122 version bits.
const bodySchema = z.object({ orgId: z.guid() });

export const PUT: RequestHandler = async ({ request, locals, cookies }) => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, 'Expected a JSON body with an organization id.');
	}
	const { orgId } = parsed.data;

	// RLS scopes this select to the caller's own memberships, so a row coming
	// back is proof of membership — no service-role client needed.
	const { data: membership, error: memberError } = await locals.supabase
		.from('organization_members')
		.select('org_id')
		.eq('org_id', orgId)
		.eq('user_id', locals.user!.id)
		.maybeSingle();

	if (memberError) {
		throw error(500, 'Could not verify membership.');
	}
	if (!membership) {
		throw error(403, 'Not a member of that organization.');
	}

	setActiveOrg(cookies, orgId);
	return new Response(null, { status: 204 });
};
