import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listTickets } from '$lib/server/crm/tickets';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `tickets` feature + read grant; see clients.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tickets);

	return { tickets: await listTickets(locals.supabase, locals.activeOrgId) };
};
