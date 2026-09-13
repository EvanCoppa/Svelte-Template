import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `tickets` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tickets);

	return {
		...(await loadRecordList(locals, 'ticket')),
		...(await loadCreateRecord(locals, 'ticket'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'tickets', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'ticket')
};
