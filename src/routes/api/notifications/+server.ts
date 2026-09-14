import { error } from '@sveltejs/kit';
import { markAllReadSchema } from '$lib/schemas/notifications';
import { markAllNotificationsRead } from '$lib/server/crm/notifications';
import { requireActiveOrg } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

/**
 * "Mark all as read" — one write across the whole inbox, which is why it is
 * here rather than on `/api/notifications/[id]`.
 *
 * A `+server.ts` endpoint rather than a form action because the bell hangs
 * off the app header on every screen: CLAUDE.md's cross-page-mutation
 * exception, the same one the note dock and the team switcher take. The hook
 * already 401s unauthenticated `/api/*` callers, and RLS narrows the update
 * to this caller's own notifications — see `$lib/server/notifications` for why
 * the org is a filter here and never a permission.
 *
 * It marks everything read, including the General stream when a reader has
 * that tab switched off: the preference decides what is drawn, not what the
 * button means.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const orgId = requireActiveOrg(locals.activeOrgId);

	const parsed = markAllReadSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		throw error(400, 'Expected a JSON body of { "read": true }.');
	}

	try {
		await markAllNotificationsRead(locals.supabase, orgId);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Those could not be marked read.');
	}

	return new Response(null, { status: 204 });
};
