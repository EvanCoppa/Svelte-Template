import { error, fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import {
	addExclusion,
	deleteMailbox,
	getMailbox,
	listExclusions,
	listMailboxes,
	removeExclusion,
	updateMailboxVisibility
} from '$lib/server/crm/mailboxes';
import { emailAccess } from '$lib/server/mail-sync/access';
import { isMailSyncConfigured, mailSyncConfig } from '$lib/server/mail-sync/config';
import { enqueueJob } from '$lib/server/mail-sync/jobs';
import { drain } from '$lib/server/mail-sync/worker';
import { getDisplayNames } from '$lib/server/profiles';
import { exclusionSchema, FORM_IDS, mailboxIdSchema, mailboxVisibilitySchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Integrations — where a member connects their Google mailbox and decides
 * how it is shared (docs/email.md).
 *
 * A settings page, so it exists for every org and is exempt from the
 * feature gate. What it OFFERS is gated here instead: the connect button
 * and the mailbox controls appear only where the `email` feature is enabled
 * for the org and the caller may manage it; a locked feature says so with
 * the upgrade prompt, a hidden one is not mentioned.
 */

/** "Sync now" runs the queue inline for this long — a page action, not a cron. */
const SYNC_NOW_BUDGET_MS = 20_000;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	const { supabase, org, user } = locals;
	if (!org || !user) throw redirect(303, '/login');
	depends(QUERY.email);

	const access = emailAccess(org);
	const configured = isMailSyncConfigured();
	const orgId = org.activeOrg.id;

	const [mailboxes, exclusions] = await Promise.all([
		access.canRead ? listMailboxes(supabase, orgId) : [],
		access.canRead ? listExclusions(supabase, orgId) : []
	]);
	const people = await getDisplayNames(
		supabase,
		mailboxes.map((mailbox) => mailbox.user_id)
	);

	const [visibilityForm, exclusionForm, removeExclusionForm, disconnectForm, syncNowForm] =
		await Promise.all([
			superValidate(zod4(mailboxVisibilitySchema), { id: FORM_IDS.visibility }),
			superValidate(zod4(exclusionSchema), { id: FORM_IDS.exclusion }),
			superValidate(zod4(mailboxIdSchema), { id: FORM_IDS.removeExclusion }),
			superValidate(zod4(mailboxIdSchema), { id: FORM_IDS.disconnect }),
			superValidate(zod4(mailboxIdSchema), { id: FORM_IDS.syncNow })
		]);

	const isOrgManager = org.activeOrg.role === 'owner' || org.activeOrg.role === 'admin';
	return {
		configured,
		access,
		mailboxes: mailboxes.map((mailbox) => ({
			id: mailbox.id,
			emailAddress: mailbox.email_address,
			ownerName: people.get(mailbox.user_id) ?? 'A former member',
			isOwn: mailbox.user_id === user.id,
			visibility: mailbox.visibility,
			status: mailbox.status,
			backfilledAt: mailbox.backfilled_at,
			lastSyncedAt: mailbox.last_synced_at,
			lastError: mailbox.last_error,
			createdAt: mailbox.created_at,
			canDisconnect: mailbox.user_id === user.id || isOrgManager,
			exclusions: exclusions
				.filter((exclusion) => exclusion.mailbox_id === mailbox.id)
				.map(({ id, pattern }) => ({ id, pattern }))
		})),
		forms: {
			visibility: visibilityForm,
			exclusion: exclusionForm,
			removeExclusion: removeExclusionForm,
			disconnect: disconnectForm,
			syncNow: syncNowForm
		},
		// The OAuth callback lands here with what happened.
		notice: {
			connected: url.searchParams.get('connected'),
			error: url.searchParams.get('error')
		}
	};
};

/** The org and the caller, refused unless the feature is on and they may manage it. */
function managerOf(locals: App.Locals) {
	const { supabase, org, user } = locals;
	if (!org || !user) throw redirect(303, '/login');
	if (!emailAccess(org).canManage) throw error(403, 'You cannot manage mailboxes here.');
	return { supabase, orgId: org.activeOrg.id, userId: user.id, org };
}

export const actions: Actions = {
	setVisibility: async ({ request, locals }) => {
		const { supabase, orgId } = managerOf(locals);
		const form = await superValidate(request, zod4(mailboxVisibilitySchema), {
			id: FORM_IDS.visibility
		});
		if (!form.valid) return fail(400, { form });
		try {
			// RLS lets only the mailbox's owner change it.
			await updateMailboxVisibility(supabase, orgId, form.data.id, form.data.visibility);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not update.', {
				status: 400
			});
		}
		return { form };
	},

	addExclusion: async ({ request, locals }) => {
		const { supabase, orgId } = managerOf(locals);
		const form = await superValidate(request, zod4(exclusionSchema), { id: FORM_IDS.exclusion });
		if (!form.valid) return fail(400, { form });
		try {
			await addExclusion(supabase, orgId, form.data.mailbox_id, form.data.pattern);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not add that.', {
				status: 400
			});
		}
		return { form };
	},

	removeExclusion: async ({ request, locals }) => {
		const { supabase, orgId } = managerOf(locals);
		const form = await superValidate(request, zod4(mailboxIdSchema), {
			id: FORM_IDS.removeExclusion
		});
		if (!form.valid) return fail(400, { form });
		try {
			await removeExclusion(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove that.', {
				status: 400
			});
		}
		return { form };
	},

	disconnect: async ({ request, locals }) => {
		const { supabase, orgId } = managerOf(locals);
		const form = await superValidate(request, zod4(mailboxIdSchema), { id: FORM_IDS.disconnect });
		if (!form.valid) return fail(400, { form });
		try {
			// The owner, or an org owner/admin — RLS's delete policy says which.
			await deleteMailbox(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not disconnect.', {
				status: 400
			});
		}
		return { form };
	},

	syncNow: async ({ request, locals }) => {
		const { supabase, orgId, userId } = managerOf(locals);
		const form = await superValidate(request, zod4(mailboxIdSchema), { id: FORM_IDS.syncNow });
		if (!form.valid) return fail(400, { form });

		const config = mailSyncConfig();
		if (!config)
			return message(form, 'Email sync is not configured on this server.', { status: 503 });
		const mailbox = await getMailbox(supabase, orgId, form.data.id);
		if (!mailbox || mailbox.user_id !== userId) {
			return message(form, 'You can only sync your own mailbox.', { status: 400 });
		}
		if (mailbox.status !== 'active') {
			return message(form, 'Reconnect the mailbox before syncing it.', { status: 400 });
		}

		const admin = createSupabaseAdminClient();
		await enqueueJob(admin, {
			orgId,
			mailboxId: mailbox.id,
			kind: mailbox.backfilled_at ? 'incremental' : 'backfill'
		});
		// Runs whatever is due for a few seconds — this job included — so a
		// developer with no cron and a person who cannot wait both get it now.
		const summary = await drain(
			{ admin, config },
			{ deadline: Date.now() + SYNC_NOW_BUDGET_MS, worker: `page:${randomUUID()}`, batch: 2 }
		);
		if (summary.failed > 0) {
			return message(form, 'Some of the sync did not finish; it will be retried.', {
				status: 400
			});
		}
		return { form };
	}
};
