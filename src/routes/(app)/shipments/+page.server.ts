import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { deleteRecord, loadDeleteRecord } from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `shipments` feature + read grant; see companies.
//
// No "Add shipment" button, and no `create` action: a shipment's `order_id` is
// not null and insert-only, so a box is packed on the order it ships — the
// "creation is genuinely special" exception. Deleting still goes through the
// generic row menu.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.shipments);

	return {
		...(await loadRecordList(locals, 'shipment')),
		...(await loadDeleteRecord(locals, 'shipment'))
	};
};

export const actions: Actions = {
	deleteRecord: (event) => deleteRecord(event, 'shipment')
};
