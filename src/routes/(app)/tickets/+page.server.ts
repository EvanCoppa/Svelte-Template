import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import {
	createRecord,
	deleteRecord,
	loadCreateRecord,
	loadDeleteRecord
} from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `tickets` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tickets);

	return {
		...(await loadRecordList(locals, 'ticket')),
		...(await loadCreateRecord(locals, 'ticket')),
		...(await loadDeleteRecord(locals, 'ticket'))
	};
};

// Creating and deleting go through the generic record form/row menu
// ($lib/server/records.ts), which open with
// requirePermission(locals.org.access, 'tickets', <level>).
export const actions: Actions = {
	create: (event) => createRecord(event, 'ticket'),
	deleteRecord: (event) => deleteRecord(event, 'ticket')
};
