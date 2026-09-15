import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	getFeature,
	listIndustryDirectory,
	listTierDirectory,
	updateFeature
} from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { navCategoryOf } from '$lib/navigation';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { updateFeatureSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One registry row: what the feature is called by default, what it looks
 * like, and where it sits in the sidebar — plus, read-only, which plans
 * unlock it and which verticals include it. Those two are edited from the
 * plan's and the vertical's own pages, because each is a fact about that
 * plan or that vertical rather than about the feature.
 *
 * There is no create and no delete here on purpose: a registry row with no
 * page behind it is a broken sidebar entry, and a deleted one cascades
 * through every grant that points at it. Both are migrations, alongside the
 * route they describe.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	const feature = await getFeature(locals.supabase, params.id);
	if (!feature) throw error(404, 'Not found.');

	const [tiers, industries, form] = await Promise.all([
		listTierDirectory(locals.supabase),
		listIndustryDirectory(locals.supabase),
		superValidate(
			{
				name: feature.name,
				noun: feature.noun ?? '',
				description: feature.description ?? '',
				// A row whose icon is null or unknown to the app opens on the
				// placeholder's own slug, so saving the form cannot quietly keep
				// an icon that does not render.
				icon: feature.icon ?? 'circle-dashed',
				category: navCategoryOf(feature.category),
				sortOrder: String(feature.sortOrder)
			},
			zod4(updateFeatureSchema),
			{ errors: false }
		)
	]);

	return { feature, tiers, industries, form, title: feature.name };
};

export const actions: Actions = {
	/**
	 * Save the row's metadata. The gate is repeated here because an action is
	 * reached by POST with no load in front of it; `features` is reference
	 * data with no write policy, so the write takes the service-role client
	 * once the post has validated.
	 *
	 * Blank `noun` and `description` are stored as null — the columns mean
	 * "nothing was said", and an industry inherits null, not ''.
	 */
	save: async ({ request, locals, params }) => {
		const operator = await requireSystemAdmin(locals);

		const feature = await getFeature(locals.supabase, params.id);
		if (!feature) throw error(404, 'Not found.');

		const form = await superValidate(request, zod4(updateFeatureSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await updateFeature(createSupabaseAdminClient(), feature.id, {
				name: form.data.name,
				noun: form.data.noun?.trim() || null,
				description: form.data.description?.trim() || null,
				icon: form.data.icon,
				category: form.data.category,
				sortOrder: Number(form.data.sortOrder)
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the feature.', {
				status: 400
			});
		}

		console.info('[platform-admin] feature updated', {
			operator: operator.id,
			feature: feature.id
		});

		return { form };
	}
};
