import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { loadRecordList } from '$lib/server/lists';
import {
	createRecord,
	deleteRecord,
	loadCreateRecord,
	loadDeleteRecord
} from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `documents` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.documents);

	return {
		...(await loadRecordList(locals, 'document')),
		...(await loadCreateRecord(locals, 'document')),
		...(await loadDeleteRecord(locals, 'document'))
	};
};

// Creating and deleting go through the generic record form/row menu
// ($lib/server/records.ts), which open with
// requirePermission(locals.org.access, 'documents', <level>). The BODY is
// never written here — naming a page and writing one are different acts, and
// the editor owns the second through `saveDocument()`.
export const actions: Actions = {
	create: (event) => createRecord(event, 'document'),
	deleteRecord: (event) => deleteRecord(event, 'document')
};
