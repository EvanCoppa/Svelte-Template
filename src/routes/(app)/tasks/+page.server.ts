import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listTasks } from '$lib/server/crm/tasks';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `tasks` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tasks);

	return {
		tasks: await listTasks(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'task'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'tasks', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'task')
};
