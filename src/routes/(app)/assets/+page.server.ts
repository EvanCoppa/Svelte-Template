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

// Gated by the hook on the `assets` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.assets);

	return {
		...(await loadRecordList(locals, 'asset')),
		...(await loadCreateRecord(locals, 'asset')),
		...(await loadDeleteRecord(locals, 'asset'))
	};
};

// Creating and deleting go through the generic record form/row menu
// ($lib/server/records.ts), which open with
// requirePermission(locals.org.access, 'assets', <level>).
export const actions: Actions = {
	create: (event) => createRecord(event, 'asset'),
	deleteRecord: (event) => deleteRecord(event, 'asset')
};
