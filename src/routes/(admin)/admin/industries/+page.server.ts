import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { createIndustry, listIndustryDirectory } from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { createIndustrySchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The verticals. Every row links to its own page, where what the vertical
 * includes — and what it calls each of those features — is edited.
 *
 * Moving an ORGANIZATION between verticals is not here; it is on that
 * organization's page, with the warning that belongs to it.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	const [industries, form] = await Promise.all([
		listIndustryDirectory(locals.supabase),
		superValidate(zod4(createIndustrySchema))
	]);

	return { industries, form };
};

export const actions: Actions = {
	/**
	 * Add a vertical. `industries` is reference data with no write policy, so
	 * the write takes the service-role client once the post has validated.
	 *
	 * What the new row does NOT come with is worth knowing before an
	 * organization is put in it, and the page says so: no features (absent
	 * from `industry_features` means hidden, so every page 404s) and no roles,
	 * which are industry-scoped and ship by migration.
	 */
	create: async ({ request, locals }) => {
		const operator = await requireSystemAdmin(locals);

		const form = await superValidate(request, zod4(createIndustrySchema));
		if (!form.valid) return fail(400, { form });

		try {
			await createIndustry(createSupabaseAdminClient(), {
				id: form.data.id,
				name: form.data.name
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not add the vertical.', {
				status: 400
			});
		}

		console.info('[platform-admin] industry created', {
			operator: operator.id,
			industry: form.data.id
		});

		return { form };
	}
};
