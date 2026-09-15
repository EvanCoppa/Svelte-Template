import { QUERY } from '$lib/queries';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import { listOrganizations } from '$lib/server/admin/organizations';
import type { PageServerLoad } from './$types';

/**
 * The organizations directory — read-only. Every row links to that
 * organization's detail page, which is where the one mutation lives; there
 * is nothing to do to an organization from the list itself.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	await requireSystemAdmin(locals);
	depends(QUERY.adminOrganizations);

	return { organizations: await listOrganizations(locals.supabase) };
};
