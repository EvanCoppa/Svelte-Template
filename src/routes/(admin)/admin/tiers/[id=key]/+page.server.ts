import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	getTier,
	listFeatureDirectory,
	renameTier,
	setTierFeatures
} from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { renameTierSchema, tierFeaturesSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One plan: what it is called, and what it unlocks.
 *
 * Editing the set of features is the whole point of the page, and it lands
 * on every organization already on this plan — the count is on screen for
 * that reason. It takes effect on each of those organizations' next request;
 * nothing is invalidated in any tenant's browser from here.
 *
 * The plan's own `title` is its name, the record-page exception the
 * `(admin)` shell makes exactly as `(app)` does.
 */

const FORM_IDS = { rename: 'rename-tier', features: 'tier-features' } as const;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	const tier = await getTier(locals.supabase, params.id);
	if (!tier) throw error(404, 'Not found.');

	const [features, renameForm, featuresForm] = await Promise.all([
		listFeatureDirectory(locals.supabase),
		superValidate({ name: tier.name }, zod4(renameTierSchema), {
			id: FORM_IDS.rename,
			errors: false
		}),
		superValidate({ featureIds: tier.featureIds }, zod4(tierFeaturesSchema), {
			id: FORM_IDS.features,
			errors: false
		})
	]);

	return { tier, features, renameForm, featuresForm, title: tier.name };
};

/** The target plan, proved to exist through the caller's own client. */
async function target(locals: App.Locals, id: string) {
	const operator = await requireSystemAdmin(locals);
	const tier = await getTier(locals.supabase, id);
	if (!tier) throw error(404, 'Not found.');
	return { operator, tier };
}

export const actions: Actions = {
	rename: async ({ request, locals, params }) => {
		const { operator, tier } = await target(locals, params.id);

		const form = await superValidate(request, zod4(renameTierSchema), { id: FORM_IDS.rename });
		if (!form.valid) return fail(400, { form });

		try {
			await renameTier(createSupabaseAdminClient(), tier.id, form.data.name);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not rename the plan.', {
				status: 400
			});
		}

		console.info('[platform-admin] tier renamed', {
			operator: operator.id,
			tier: tier.id,
			from: tier.name,
			to: form.data.name
		});

		return { form };
	},

	/**
	 * Set exactly which features this plan unlocks. Every posted id is checked
	 * against the registry first, so an unknown one is a readable message
	 * rather than a foreign-key error halfway through the write.
	 */
	setFeatures: async ({ request, locals, params }) => {
		const { operator, tier } = await target(locals, params.id);

		const form = await superValidate(request, zod4(tierFeaturesSchema), { id: FORM_IDS.features });
		if (!form.valid) return fail(400, { form });

		const registry = await listFeatureDirectory(locals.supabase);
		const known = new Set(registry.map((feature) => feature.id));
		const unknown = form.data.featureIds.filter((id) => !known.has(id));
		if (unknown.length > 0) {
			return message(form, `Not a feature on this platform: ${unknown.join(', ')}.`, {
				status: 400
			});
		}

		try {
			await setTierFeatures(createSupabaseAdminClient(), tier.id, form.data.featureIds);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the plan.', {
				status: 400
			});
		}

		console.info('[platform-admin] tier features changed', {
			operator: operator.id,
			tier: tier.id,
			from: tier.featureIds.length,
			to: form.data.featureIds.length
		});

		return { form };
	}
};
