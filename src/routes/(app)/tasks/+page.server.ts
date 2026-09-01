import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listTasks } from '$lib/server/crm/tasks';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `tasks` feature + read grant; see clients.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tasks);

	return { tasks: await listTasks(locals.supabase, locals.activeOrgId) };
};
