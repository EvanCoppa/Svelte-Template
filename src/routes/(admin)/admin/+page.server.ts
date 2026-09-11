import { requireSystemAdmin } from '$lib/server/admin/guard';
import { countPlatform } from '$lib/server/admin/catalog';
import type { PageServerLoad } from './$types';

/**
 * The platform overview: what the console can reach, and how much of each
 * thing there is. Read-only, like everything in Phase 2 — the one mutation
 * lives on an organization's own page.
 *
 * The guard runs again here rather than trusting the layout's: every entry
 * point into the platform area proves the operator flag for itself
 * (docs/platform-administration.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireSystemAdmin(locals);

	return { counts: await countPlatform(locals.supabase) };
};
