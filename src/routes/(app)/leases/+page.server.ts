import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listLeases } from '$lib/server/crm/leases';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `leases` feature + read grant; see companies.
//
// The rows arrive with their property and tenant and nothing else: whether a
// lease is running is a question about today, and the page answers it in the
// browser with the viewer's own date (see `leaseStateOn()`).
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.leases);

	return {
		leases: await listLeases(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'lease'))
	};
};

export const actions: Actions = {
	create: (event) => createRecord(event, 'lease')
};
