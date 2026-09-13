import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listProperties } from '$lib/server/crm/properties';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `properties` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.properties);

	return {
		properties: await listProperties(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'property'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'properties', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'property')
};
