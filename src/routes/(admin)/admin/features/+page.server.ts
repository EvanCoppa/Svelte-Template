import { requireSystemAdmin } from '$lib/server/admin/guard';
import { listFeatureDirectory } from '$lib/server/admin/catalog';
import type { PageServerLoad } from './$types';

/**
 * The feature registry, listed in nav order — the platform's own view of
 * what the product is made of, with no organization resolving it into modes.
 * Read-only: a feature's row, its route, the plans that unlock it and the
 * verticals that include it are all migration-owned, and an editor for them
 * is deferred work (docs/platform-administration.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireSystemAdmin(locals);

	return { features: await listFeatureDirectory(locals.supabase) };
};
