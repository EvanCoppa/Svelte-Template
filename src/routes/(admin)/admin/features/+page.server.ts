import { QUERY } from '$lib/queries';
import { listFeatureDirectory } from '$lib/server/admin/catalog';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import type { PageServerLoad } from './$types';

/**
 * The feature registry, listed in nav order — the platform's own view of
 * what the product is made of, with no organization resolving it into modes.
 * Every row links to its own page, where the default words, the icon and the
 * position are edited.
 *
 * The list itself is only ever read: a feature is CREATED by the migration
 * that adds its route, because a registry row with no page behind it is a
 * broken sidebar entry. Which plans unlock it and which verticals include it
 * are edited from those pages, each being a fact about the plan or the
 * vertical rather than about the feature.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminCatalog);

	return { features: await listFeatureDirectory(locals.supabase) };
};
