import { listIndustries, listTiers } from '$lib/server/admin';
import { loadFeatureRegistry } from '$lib/server/features';
import { requireOperator } from '$lib/server/operator';
import type { LayoutServerLoad } from './$types';

/**
 * The operator console. `requireOperator()` answers 404 to anyone who is
 * not a platform operator — every child load and action opens with the
 * same call, since a sibling navigation need not re-run this layout — and
 * the catalogs every section renders from load here once.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const db = await requireOperator(locals);
	const [industries, tiers, registry] = await Promise.all([
		listIndustries(db),
		listTiers(db),
		loadFeatureRegistry(db)
	]);
	return { industries, tiers, registry };
};
