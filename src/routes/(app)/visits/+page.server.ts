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

// Gated by the hook on the `visits` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.visits);

	return {
		...(await loadRecordList(locals, 'visit')),
		...(await loadCreateRecord(locals, 'visit')),
		...(await loadDeleteRecord(locals, 'visit'))
	};
};

// Creating and deleting go through the generic record form/row menu
// ($lib/server/records.ts), which open with
// requirePermission(locals.org.access, 'visits', <level>).
export const actions: Actions = {
	create: (event) => createRecord(event, 'visit'),
	deleteRecord: (event) => deleteRecord(event, 'visit')
};
