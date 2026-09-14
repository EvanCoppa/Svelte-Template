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

// The hook already gated this route on the `leases` feature and the read
// grant; the load only fetches, and adds the empty create form every list
// page's "Add …" button posts, plus the empty delete form its row menu posts.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.leases);

	return {
		...(await loadRecordList(locals, 'lease')),
		...(await loadCreateRecord(locals, 'lease')),
		...(await loadDeleteRecord(locals, 'lease'))
	};
};

// Two generic actions for every kind of record ($lib/server/records.ts); each
// opens with requirePermission(locals.org.access, 'leases', <level>).
export const actions: Actions = {
	create: (event) => createRecord(event, 'lease'),
	deleteRecord: (event) => deleteRecord(event, 'lease')
};
