import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setActiveOrg } from '$lib/server/active-org';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { acceptInvite, acceptanceFor, lookupInvite } from '$lib/server/staff';
import { acceptInviteSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Accepting an invitation to join an organization.
 *
 * Deliberately outside the `(app)` group: the person arriving here is not a
 * member of the inviting org yet, so there is no active org to render a
 * sidebar around. It is still a protected route — `hooks.server.ts` is
 * default-deny, so a signed-out visitor is sent to
 * `/login?next=/invite/<token>` and lands back here afterwards.
 *
 * Both the load and the action go through the service-role client: the
 * caller can see neither the invite row nor the org through their own
 * client (RLS scopes both to members). Everything written is derived from
 * the token lookup — the browser supplies only the token in the URL, never
 * an org id or a role.
 */

function adminClient() {
	try {
		return createSupabaseAdminClient();
	} catch {
		// A fork that hasn't set the service-role key gets a readable page
		// instead of a stack trace.
		throw error(500, 'Invitations are not configured on this deployment.');
	}
}

export const load: PageServerLoad = async ({ locals: { user }, params }) => {
	if (!user) throw redirect(303, '/login');

	const invite = await lookupInvite(adminClient(), params.token, {
		id: user.id,
		email: user.email ?? null
	});

	return { invite, form: await superValidate(zod4(acceptInviteSchema)) };
};

export const actions: Actions = {
	accept: async ({ locals: { user }, params, cookies, request }) => {
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(acceptInviteSchema));
		if (!form.valid) return fail(400, { form });

		// Re-resolved rather than trusted from the load: the invite may have
		// been revoked or expired in the meantime, and the token in the URL is
		// the only thing the browser gets a say in.
		const invite = await lookupInvite(adminClient(), params.token, {
			id: user.id,
			email: user.email ?? null
		});

		const acceptance = acceptanceFor(invite);
		if (acceptance.action === 'refuse') {
			return message(form, acceptance.message, { status: 400 });
		}

		if (acceptance.action === 'join') {
			try {
				await acceptInvite(
					adminClient(),
					{ orgId: acceptance.orgId, inviteId: acceptance.inviteId },
					user.id
				);
			} catch (err) {
				return message(
					form,
					err instanceof Error ? err.message : 'Could not accept the invitation.',
					{ status: 400 }
				);
			}
		}

		// Land in the org they just joined (or already belonged to) rather than
		// whichever one the cookie last pointed at.
		setActiveOrg(cookies, acceptance.orgId);
		throw redirect(303, '/');
	}
};
