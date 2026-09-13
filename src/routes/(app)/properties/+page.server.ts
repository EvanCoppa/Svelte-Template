import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// The hook already gated this route on the `properties` feature and the read
// grant; the load only fetches, and adds the empty create form every list
// page's "Add …" button posts.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.properties);

	return {
		...(await loadRecordList(locals, 'property')),
		...(await loadCreateRecord(locals, 'property'))
	};
};

// One generic action for every kind of record ($lib/server/records.ts); it
// opens with requirePermission(locals.org.access, 'properties', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'property')
};
