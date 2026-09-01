import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listDeals } from '$lib/server/crm/deals';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `deals` feature + read grant; see clients.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.deals);

	return { deals: await listDeals(locals.supabase, locals.activeOrgId) };
};
