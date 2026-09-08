import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { passesFeatureGate } from '$lib/features/gate';
import type { FeatureId } from '$lib/features/types';
import {
	isPreferenceKey,
	PREFERENCES,
	PREFERENCE_KEYS,
	type PreferenceKey,
	type PreferenceValue
} from '$lib/preferences';
import { QUERY } from '$lib/queries';
import { loadPreferences, savePreference } from '$lib/server/preferences';
import { hasGrant } from '$lib/server/roles';
import { preferencesSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The account axis of settings — the switches that follow you to any browser
 * (docs/user-preferences.md). The device axis is on the same page but needs no
 * load: theme lives in the browser and the component reads it there.
 *
 * A settings page, so it is exempt from the feature gate and exists for every
 * org. Which switches it OFFERS is gated, though: a preference that belongs to
 * a feature is only listed while that feature is on screen for the active org.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, user } = locals;
	if (!org || !user) throw redirect(303, '/login');
	depends(QUERY.preferences);

	// The same question the nav and the route gate ask of that feature.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const offered = (featureId: FeatureId | undefined): boolean => {
		if (!featureId) return true;
		const resolved = org.features[featureId];
		return (
			resolved !== undefined && passesFeatureGate(resolved.feature.route, org.features, canRead)
		);
	};

	const rows = PREFERENCE_KEYS.filter((key) => offered(PREFERENCES[key].feature)).map((key) => ({
		key,
		kind: PREFERENCES[key].kind,
		label: PREFERENCES[key].label,
		description: PREFERENCES[key].description
	}));

	const preferences = await loadPreferences(supabase, user.id);
	const form = await superValidate(
		{ values: Object.fromEntries(rows.map(({ key }) => [key, preferences[key]])) },
		zod4(preferencesSchema),
		{ errors: false }
	);

	return { form, rows };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const { supabase, user } = locals;
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(preferencesSchema));
		if (!form.valid) return fail(400, { form });

		// A key this build does not know is dropped rather than stored: the
		// registry is the only thing that says what a preference is.
		const posted = Object.entries(form.data.values).filter(
			(entry): entry is [PreferenceKey, unknown] => isPreferenceKey(entry[0])
		);

		// The boundary: a posted value is whatever the browser sent, and this is
		// where it meets the schema its key declares. `jsonb` would store any of
		// it, so nothing below this line takes an unparsed value.
		const updates: { key: PreferenceKey; value: PreferenceValue }[] = [];
		for (const [key, value] of posted) {
			const parsed = PREFERENCES[key].schema.safeParse(value);
			if (!parsed.success) {
				return message(form, `${PREFERENCES[key].label} does not accept that value.`, {
					status: 400
				});
			}
			updates.push({ key, value: parsed.data });
		}

		try {
			// One row each, so two preferences never overwrite one another.
			await Promise.all(
				updates.map(({ key, value }) => savePreference(supabase, user.id, key, value))
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	}
};
