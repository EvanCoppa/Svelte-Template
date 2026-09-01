import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { sendEmail } from '$lib/server/email';
import { orgInviteEmail } from '$lib/server/email-templates';
import {
	can,
	getUserAccess,
	listRoles,
	requirePermission,
	assignRole,
	unassignRole
} from '$lib/server/roles';
import {
	createInvite,
	getMembership,
	inviteUrl,
	listInvites,
	listStaff,
	removeMember,
	revokeInvite
} from '$lib/server/staff';
import {
	assignRoleSchema,
	inviteLinkSchema,
	inviteSchema,
	removeMemberSchema,
	unassignRoleSchema,
	revokeInviteSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Staff — who is in the active organization, what they can do, and who is
 * invited. The page that uses all three permission levels:
 *
 *   read    the roster
 *   manage  invite, revoke an invite, assign and unassign roles
 *   delete  remove a member from the org
 *
 * Every action re-derives the caller's access from the database rather than
 * trusting anything posted, and RLS backs each one independently (see the
 * staff_management migration) — the checks here decide what the screen
 * offers and produce a readable failure, they are not the boundary.
 */

/**
 * Explicit form ids, shared by the load, the actions and the six `superForm`
 * instances on the page. Superforms derives an id from the schema's shape,
 * and assignRole/unassignRole are structurally identical (`user_id` +
 * `role_id`) — so without these two forms would answer to each other's
 * results. Naming all six keeps that hazard from reappearing when a schema
 * changes, and keeps the no-JS path (where the id round-trips through the
 * POST) routing to the form that was actually submitted.
 */
const FORM_IDS = {
	invite: 'invite',
	inviteLink: 'invite-link',
	assignRole: 'assign-role',
	unassignRole: 'unassign-role',
	revokeInvite: 'revoke-invite',
	removeMember: 'remove-member'
} as const;

/** The caller's access in the active org, rebuilt for an action. */
async function accessFor(locals: App.Locals) {
	const { supabase, user, activeOrgId } = locals;
	if (!user) throw redirect(303, '/login');
	if (!activeOrgId) throw error(400, 'No active organization.');

	const membership = await getMembership(supabase, activeOrgId, user.id);
	if (!membership) throw error(403, 'You are not a member of this organization.');

	return {
		orgId: activeOrgId,
		orgName: membership.orgName,
		user,
		access: await getUserAccess(
			supabase,
			activeOrgId,
			user.id,
			membership.role,
			membership.industryId
		)
	};
}

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	const { supabase, user } = locals;
	if (!user) throw redirect(303, '/login');
	depends(QUERY.staff);

	const { activeOrg } = await parent();
	const access = await getUserAccess(
		supabase,
		activeOrg.id,
		user.id,
		activeOrg.role,
		activeOrg.industryId
	);
	// No `read` and the page does not exist for you.
	requirePermission(access, 'staff');

	const manages = can(access, 'staff', 'manage');

	const [
		staff,
		roles,
		invites,
		inviteForm,
		inviteLinkForm,
		assignForm,
		unassignForm,
		revokeForm,
		removeForm
	] = await Promise.all([
		listStaff(supabase, activeOrg.id),
		listRoles(supabase, activeOrg.industryId),
		// Invite rows carry join tokens; only a manager may see them, and RLS
		// would return zero rows anyway.
		manages ? listInvites(supabase, activeOrg.id) : [],
		superValidate(zod4(inviteSchema), { id: FORM_IDS.invite }),
		superValidate(zod4(inviteLinkSchema), { id: FORM_IDS.inviteLink }),
		superValidate(zod4(assignRoleSchema), { id: FORM_IDS.assignRole }),
		superValidate(zod4(unassignRoleSchema), { id: FORM_IDS.unassignRole }),
		superValidate(zod4(revokeInviteSchema), { id: FORM_IDS.revokeInvite }),
		superValidate(zod4(removeMemberSchema), { id: FORM_IDS.removeMember })
	]);

	return {
		staff,
		roles,
		invites,
		/** What the screen may offer — the load already proved `read`. */
		canManage: manages,
		canRemove: can(access, 'staff', 'delete'),
		inviteForm,
		inviteLinkForm,
		assignForm,
		unassignForm,
		revokeForm,
		removeForm
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const { locals, request, url } = event;
		const { orgId, orgName, user, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(inviteSchema), { id: FORM_IDS.invite });
		if (!form.valid) return fail(400, { form });
		if (!can(access, 'staff', 'manage')) {
			return message(form, 'You do not have permission to invite people.', { status: 403 });
		}

		try {
			const invite = await createInvite(locals.supabase, orgId, form.data.email);

			// The invitee is waiting on this mail, so a failed send is the
			// action's failure — the invite row stays, and the link can still be
			// copied from the pending list.
			const result = await sendEmail({
				to: form.data.email,
				...orgInviteEmail({
					orgName,
					inviterName: user.email ?? 'A teammate',
					inviteUrl: inviteUrl(url.origin, invite.token)
				}),
				idempotencyKey: `org-invite/${invite.id}`
			});
			if (!result.ok) {
				return message(
					form,
					`Invite created, but the email could not be sent (${result.error}). Copy the link from the pending list instead.`,
					{ status: 500 }
				);
			}
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not create the invite.', {
				status: 400
			});
		}

		return { form };
	},

	createLink: async ({ locals, request }) => {
		const { orgId, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(inviteLinkSchema), { id: FORM_IDS.inviteLink });
		if (!can(access, 'staff', 'manage')) {
			return message(form, 'You do not have permission to create invite links.', { status: 403 });
		}

		try {
			await createInvite(locals.supabase, orgId, null);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not create the link.', {
				status: 400
			});
		}

		return { form };
	},

	revokeInvite: async ({ locals, request }) => {
		const { orgId, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(revokeInviteSchema), {
			id: FORM_IDS.revokeInvite
		});
		if (!form.valid) return fail(400, { form });
		if (!can(access, 'staff', 'manage')) {
			return message(form, 'You do not have permission to revoke invites.', { status: 403 });
		}

		try {
			await revokeInvite(locals.supabase, orgId, form.data.invite_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not revoke the invite.', {
				status: 400
			});
		}

		return { form };
	},

	assignRole: async ({ locals, request }) => {
		const { orgId, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(assignRoleSchema), { id: FORM_IDS.assignRole });
		if (!form.valid) return fail(400, { form });
		if (!can(access, 'staff', 'manage')) {
			return message(form, 'You do not have permission to change roles.', { status: 403 });
		}

		try {
			await assignRole(locals.supabase, orgId, form.data.user_id, form.data.role_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not assign the role.', {
				status: 400
			});
		}

		return { form };
	},

	unassignRole: async ({ locals, request }) => {
		const { orgId, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(unassignRoleSchema), {
			id: FORM_IDS.unassignRole
		});
		if (!form.valid) return fail(400, { form });
		if (!can(access, 'staff', 'manage')) {
			return message(form, 'You do not have permission to change roles.', { status: 403 });
		}

		try {
			await unassignRole(locals.supabase, orgId, form.data.user_id, form.data.role_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not remove the role.', {
				status: 400
			});
		}

		return { form };
	},

	removeMember: async ({ locals, request }) => {
		const { orgId, user, access } = await accessFor(locals);
		const form = await superValidate(request, zod4(removeMemberSchema), {
			id: FORM_IDS.removeMember
		});
		if (!form.valid) return fail(400, { form });
		if (!can(access, 'staff', 'delete')) {
			return message(form, 'You do not have permission to remove people.', { status: 403 });
		}
		// Leaving your own org is a different act with different consequences
		// (you would lose the page you are standing on); the roster does not
		// offer it.
		if (form.data.user_id === user.id) {
			return message(form, 'You cannot remove yourself from the organization.', { status: 400 });
		}

		try {
			await removeMember(locals.supabase, orgId, form.data.user_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not remove the member.', {
				status: 400
			});
		}

		return { form };
	}
};
