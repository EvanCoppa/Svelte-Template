import { requireSystemAdmin } from '$lib/server/admin/guard';
import { listIndustryDirectory } from '$lib/server/admin/catalog';
import type { PageServerLoad } from './$types';

/**
 * The verticals, listed. Which features a vertical includes — and what it
 * calls them — is reference data written by migration; changing an
 * organization's industry is deferred work (docs/platform-administration.md),
 * because it re-resolves that organization's features, roles and vocabulary
 * all at once.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireSystemAdmin(locals);

	return { industries: await listIndustryDirectory(locals.supabase) };
};
