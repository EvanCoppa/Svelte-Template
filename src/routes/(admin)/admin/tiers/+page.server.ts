import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { createTier, listTierDirectory } from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { createTierSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The plans. Every row links to its own page, where what it unlocks is
 * edited; this page adds one.
 *
 * Moving an ORGANIZATION between plans is not here — it is done on that
 * organization's page, because it is a fact about that organization and not
 * about the plan.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	const [tiers, form] = await Promise.all([
		listTierDirectory(locals.supabase),
		superValidate(zod4(createTierSchema))
	]);

	return { tiers, form };
};

export const actions: Actions = {
	/**
	 * Add a plan. The gate is repeated here because an action is reached by
	 * POST with no load in front of it. `tiers` has no write policy at all —
	 * it is reference data every authenticated user may read — so the write
	 * takes the service-role client, created only once the post has validated.
	 *
	 * A duplicate id is a primary-key violation, and the message PostgREST
	 * returns for it is worth showing an operator verbatim.
	 */
	create: async ({ request, locals }) => {
		const operator = await requireSystemAdmin(locals);

		const form = await superValidate(request, zod4(createTierSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await createTier(createSupabaseAdminClient(), { id: form.data.id, name: form.data.name });
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not add the plan.', {
				status: 400
			});
		}

		console.info('[platform-admin] tier created', {
			operator: operator.id,
			tier: form.data.id
		});

		return { form };
	}
};
