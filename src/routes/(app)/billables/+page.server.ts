import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listBillables } from '$lib/server/crm/billables';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `billables` feature + read grant; see companies.
// Named by the feature as the org's industry says it — Procedures, Services.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.billables);

	return {
		billables: await listBillables(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'billable'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'billables', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'billable')
};
