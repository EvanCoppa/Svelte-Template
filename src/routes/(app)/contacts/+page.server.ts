import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `contacts` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.contacts);

	return {
		...(await loadRecordList(locals, 'contact')),
		...(await loadCreateRecord(locals, 'contact'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'contacts', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'contact')
};
