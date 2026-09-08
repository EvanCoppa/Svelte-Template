import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import type { PageServerLoad } from './$types';

// The hook already gated this route on the `companies` feature and the read
// grant; the load only fetches. Writes go through form actions that open
// with requirePermission(locals.org.access, 'companies', 'manage').
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.companies);

	return { companies: await listCompanies(locals.supabase, locals.activeOrgId) };
};
