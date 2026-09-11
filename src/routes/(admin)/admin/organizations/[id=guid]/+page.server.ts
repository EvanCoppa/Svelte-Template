import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { listTierDirectory } from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import {
	findOrganization,
	getOrganization,
	setOrganizationTier
} from '$lib/server/admin/organizations';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { setTierSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One organization, read-only — except for the plan it is on, which is the
 * platform area's single controlled mutation (Phase 3 of
 * docs/platform-administration.md).
 *
 * The target organization is the one in the URL and nothing else: the
 * platform area never reads the active-organization cookie, so an operator
 * can be working in Acme in the app and looking at Globex here without
 * either affecting the other.
 *
 * The page's own `title` is the organization's name — the one case where a
 * page is not named by the nav list, the same exception the `(app)` shell
 * makes for a record page.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminOrganizations);

	const organization = await getOrganization(locals.supabase, params.id);
	// Indistinguishable from an id that names nothing, which is what it is
	// for anyone the organizations policy does not show this row to.
	if (!organization) throw error(404, 'Not found.');

	const [tiers, form] = await Promise.all([
		listTierDirectory(locals.supabase),
		superValidate({ tierId: organization.tierId }, zod4(setTierSchema), { errors: false })
	]);

	return { organization, tiers, form, title: organization.name };
};

export const actions: Actions = {
	/**
	 * Move this organization to another plan.
	 *
	 * The gate is repeated here because an action is reached by POST with no
	 * load in front of it — the layout's check protects pages, not this. Then
	 * the target is validated (an organization this operator can see) and so
	 * is the requested plan (a row in `tiers`), before the service-role client
	 * is created at all: `organizations.tier_id` is revoked from
	 * `authenticated`, so this column is operator-owned and the update cannot
	 * go through the caller's own client.
	 */
	setTier: async ({ request, locals, params }) => {
		const operator = await requireSystemAdmin(locals);

		const form = await superValidate(request, zod4(setTierSchema));
		if (!form.valid) return fail(400, { form });

		const [target, tiers] = await Promise.all([
			findOrganization(locals.supabase, params.id),
			listTierDirectory(locals.supabase)
		]);
		if (!target) throw error(404, 'Not found.');

		const tier = tiers.find((t) => t.id === form.data.tierId);
		if (!tier) return message(form, 'That is not a plan on this platform.', { status: 400 });

		try {
			await setOrganizationTier(createSupabaseAdminClient(), target.id, tier.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not change the plan.', {
				status: 400
			});
		}

		// The trace this change leaves for now. A real audit table is deferred
		// work; until there is one, the server log is where a plan change is
		// answerable for, so it records who, which organization, and from what.
		console.info('[platform-admin] organization tier changed', {
			operator: operator.id,
			organization: target.id,
			from: target.tierId,
			to: tier.id
		});

		return { form };
	}
};
