import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	getIndustry,
	listFeatureDirectory,
	renameIndustry,
	setIndustryFeatureNaming,
	setIndustryFeatures
} from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { industryFeaturesSchema, industryNamingSchema, renameIndustrySchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One vertical: what it is called, which features it includes at all, and
 * what it calls each of them.
 *
 * The three writes are deliberately separate. Membership is a set, and
 * saving it is one post; naming is per feature, and saving one feature's
 * words should not rewrite another's. They also differ in blast radius: a
 * feature removed from a vertical is a page that 404s for every organization
 * in it, while a renamed one is a word on a button.
 *
 * The vertical's own `title` is its name, the record-page exception the
 * `(admin)` shell makes exactly as `(app)` does.
 */

const FORM_IDS = {
	rename: 'rename-industry',
	features: 'industry-features',
	naming: 'industry-naming'
} as const;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	const industry = await getIndustry(locals.supabase, params.id);
	if (!industry) throw error(404, 'Not found.');

	const [features, renameForm, featuresForm, namingForm] = await Promise.all([
		listFeatureDirectory(locals.supabase),
		superValidate({ name: industry.name }, zod4(renameIndustrySchema), {
			id: FORM_IDS.rename,
			errors: false
		}),
		superValidate(
			{ featureIds: industry.features.map((f) => f.featureId) },
			zod4(industryFeaturesSchema),
			{ id: FORM_IDS.features, errors: false }
		),
		superValidate(zod4(industryNamingSchema), { id: FORM_IDS.naming })
	]);

	return { industry, features, renameForm, featuresForm, namingForm, title: industry.name };
};

/** The target vertical, proved to exist through the caller's own client. */
async function target(locals: App.Locals, id: string) {
	const operator = await requireSystemAdmin(locals);
	const industry = await getIndustry(locals.supabase, id);
	if (!industry) throw error(404, 'Not found.');
	return { operator, industry };
}

export const actions: Actions = {
	rename: async ({ request, locals, params }) => {
		const { operator, industry } = await target(locals, params.id);

		const form = await superValidate(request, zod4(renameIndustrySchema), { id: FORM_IDS.rename });
		if (!form.valid) return fail(400, { form });

		try {
			await renameIndustry(createSupabaseAdminClient(), industry.id, form.data.name);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not rename the vertical.',
				{ status: 400 }
			);
		}

		console.info('[platform-admin] industry renamed', {
			operator: operator.id,
			industry: industry.id,
			from: industry.name,
			to: form.data.name
		});

		return { form };
	},

	/**
	 * Set exactly which features this vertical includes. Written as a diff by
	 * `setIndustryFeatures()`, so the naming and ordering on the rows that
	 * stay are left alone — see that function for why that matters.
	 */
	setFeatures: async ({ request, locals, params }) => {
		const { operator, industry } = await target(locals, params.id);

		const form = await superValidate(request, zod4(industryFeaturesSchema), {
			id: FORM_IDS.features
		});
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
			await setIndustryFeatures(createSupabaseAdminClient(), industry.id, form.data.featureIds);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not save the vertical.',
				{
					status: 400
				}
			);
		}

		console.info('[platform-admin] industry features changed', {
			operator: operator.id,
			industry: industry.id,
			from: industry.features.length,
			to: form.data.featureIds.length
		});

		return { form };
	},

	/**
	 * What this vertical calls one feature, and where it sits.
	 *
	 * A blank field is stored as NULL, not '': null is how
	 * `resolveFeatures()` reads "inherit the feature's own", column by column,
	 * so clearing the box is how an override is removed.
	 */
	setNaming: async ({ request, locals, params }) => {
		const { operator, industry } = await target(locals, params.id);

		const form = await superValidate(request, zod4(industryNamingSchema), { id: FORM_IDS.naming });
		if (!form.valid) return fail(400, { form });

		if (!industry.features.some((f) => f.featureId === form.data.featureId)) {
			return message(form, 'This vertical does not include that feature.', { status: 400 });
		}

		const sortOrder = form.data.sortOrder?.trim();

		try {
			await setIndustryFeatureNaming(
				createSupabaseAdminClient(),
				industry.id,
				form.data.featureId,
				{
					name: form.data.name?.trim() || null,
					noun: form.data.noun?.trim() || null,
					sortOrder: sortOrder ? Number(sortOrder) : null
				}
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the words.', {
				status: 400
			});
		}

		console.info('[platform-admin] industry feature naming changed', {
			operator: operator.id,
			industry: industry.id,
			feature: form.data.featureId
		});

		return { form };
	}
};
