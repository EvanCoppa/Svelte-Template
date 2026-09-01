import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { FeatureMode } from '$lib/features/types';
import { QUERY } from '$lib/queries';
import { setDisabledFeatures } from '$lib/server/features';
import { featuresSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/** The org's self-service axis: switch available features on and off. */
const TOGGLEABLE: readonly FeatureMode[] = ['enabled', 'disabled'];

function canManage(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (!locals.org) throw redirect(303, '/login');
	depends(QUERY.features);

	const { activeOrg, features } = locals.org;

	// Hidden features do not exist for this org, so they are not listed; a
	// locked one is shown with an upgrade prompt instead of a switch.
	const rows = Object.values(features)
		.filter(({ mode }) => mode !== 'hidden')
		.sort(
			(a, b) =>
				a.feature.sort_order - b.feature.sort_order || a.feature.name.localeCompare(b.feature.name)
		)
		.map(({ feature, mode }) => ({ ...feature, mode }));

	const form = await superValidate(
		{ enabled: rows.filter((f) => f.mode === 'enabled').map((f) => f.id) },
		zod4(featuresSchema),
		{ errors: false }
	);

	return {
		form,
		rows,
		canManage: canManage(activeOrg.role),
		// A `disabled` gate redirect lands here with the feature it bounced.
		highlight: url.searchParams.get('feature')
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.org) throw redirect(303, '/login');
		const { activeOrg, features } = locals.org;
		if (!canManage(activeOrg.role)) {
			throw error(403, 'Only owners and admins can change which features are on.');
		}

		const form = await superValidate(request, zod4(featuresSchema));
		if (!form.valid) return fail(400, { form });

		const available = Object.values(features).filter(({ mode }) => TOGGLEABLE.includes(mode));
		const availableIds = new Set(available.map(({ feature }) => feature.id));
		const wanted = new Set(form.data.enabled);

		// Only what the org actually has can be toggled — a locked or hidden
		// feature cannot be "enabled" from here (RLS refuses it too).
		if (form.data.enabled.some((id) => !availableIds.has(id))) {
			return message(form, 'Only features on your plan can be turned on or off.', {
				status: 400
			});
		}

		const disable = available
			.filter(({ feature, mode }) => mode === 'enabled' && !wanted.has(feature.id))
			.map(({ feature }) => feature.id);
		const enable = available
			.filter(({ feature, mode }) => mode === 'disabled' && wanted.has(feature.id))
			.map(({ feature }) => feature.id);

		try {
			await setDisabledFeatures(locals.supabase, activeOrg.id, { disable, enable });
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	}
};
