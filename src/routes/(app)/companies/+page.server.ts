import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// The hook already gated this route on the `companies` feature and the read
// grant; the load only fetches, and adds the empty create form every list
// page's "Add …" button posts.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.companies);

	return {
		companies: await listCompanies(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'company'))
	};
};

// One generic action for every kind of record ($lib/server/records.ts); it
// opens with requirePermission(locals.org.access, 'companies', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'company')
};
