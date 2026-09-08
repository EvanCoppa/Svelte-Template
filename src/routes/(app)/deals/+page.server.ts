import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listDeals } from '$lib/server/crm/deals';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `deals` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.deals);

	return {
		deals: await listDeals(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'deal'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'deals', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'deal')
};
