import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { pairKey, splitPair } from '$lib/features/pairs';
import type { FeatureRegistryRow } from '$lib/features/types';
import {
	diffSets,
	setIndustryFeatures,
	setTierFeatures,
	updateFeatureCatalog
} from '$lib/server/admin';
import { loadFeatureRegistry } from '$lib/server/features';
import { requireOperator } from '$lib/server/operator';
import { availabilitySchema, catalogSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/** The registry's industry and tier maps as the matrices post them. */
function currentPairs(registry: FeatureRegistryRow[]) {
	return {
		industries: registry.flatMap((f) =>
			f.industry_features.map((i) => pairKey(f.id, i.industry_id))
		),
		tiers: registry.flatMap((f) => f.tier_features.map((t) => pairKey(f.id, t.tier_id)))
	};
}

function splitAll(keys: string[]): [string, string][] {
	return keys.flatMap((key) => {
		const pair = splitPair(key);
		return pair ? [pair] : [];
	});
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	await requireOperator(locals);
	const { registry } = await parent();

	const [catalogForm, availabilityForm] = await Promise.all([
		superValidate(
			{
				features: registry.map(({ id, name, description, icon, category, sort_order }) => ({
					id,
					name,
					description: description ?? '',
					icon: icon ?? '',
					category,
					sort_order
				}))
			},
			zod4(catalogSchema),
			{ errors: false }
		),
		superValidate(currentPairs(registry), zod4(availabilitySchema), { errors: false })
	]);

	return { catalogForm, availabilityForm };
};

export const actions: Actions = {
	saveCatalog: async ({ locals, request }) => {
		const db = await requireOperator(locals);
		const form = await superValidate(request, zod4(catalogSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await updateFeatureCatalog(
				db,
				form.data.features.map((feature) => ({
					...feature,
					description: feature.description || null,
					icon: feature.icon || null
				}))
			);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	},

	saveAvailability: async ({ locals, request }) => {
		const db = await requireOperator(locals);
		const form = await superValidate(request, zod4(availabilitySchema));
		if (!form.valid) return fail(400, { form });

		const posted = [...form.data.industries, ...form.data.tiers];
		if (posted.some((key) => splitPair(key) === null)) {
			return message(form, 'The availability grid posted a malformed cell.', { status: 400 });
		}

		// Diff against what is stored now, so a save only touches the cells
		// that changed; unknown ids are refused by the foreign keys.
		const current = currentPairs(await loadFeatureRegistry(db));
		const industries = diffSets(current.industries, form.data.industries);
		const tiers = diffSets(current.tiers, form.data.tiers);

		try {
			await setIndustryFeatures(db, {
				add: splitAll(industries.add),
				remove: splitAll(industries.remove)
			});
			await setTierFeatures(db, { add: splitAll(tiers.add), remove: splitAll(tiers.remove) });
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	}
};
