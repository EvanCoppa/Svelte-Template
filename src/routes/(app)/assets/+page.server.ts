import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listAssets } from '$lib/server/crm/assets';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `assets` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.assets);

	return {
		assets: await listAssets(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'asset'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'assets', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'asset')
};
