import { requireSystemAdmin } from '$lib/server/admin/guard';
import { listTierDirectory } from '$lib/server/admin/catalog';
import type { PageServerLoad } from './$types';

/**
 * The plans, listed. Reference data: what a plan unlocks is a migration, so
 * there is nothing to edit here — moving one organization between plans is
 * done on that organization's page.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireSystemAdmin(locals);

	return { tiers: await listTierDirectory(locals.supabase) };
};
