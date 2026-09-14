import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { loadRecordList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `invoices` feature + read grant; see companies.
// A new invoice is a draft with a customer and terms — the generic record
// form, with its party pickers — and gets its lines on its own page.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.invoices);

	return {
		...(await loadRecordList(locals, 'invoice')),
		...(await loadCreateRecord(locals, 'invoice'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'invoices', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'invoice')
};
