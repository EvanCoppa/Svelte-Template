import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listClients } from '$lib/server/crm/clients';
import type { PageServerLoad } from './$types';

// The hook already gated this route on the `clients` feature and the read
// grant; the load only fetches. Writes go through form actions that open
// with requirePermission(locals.org.access, 'clients', 'manage').
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.clients);

	return { clients: await listClients(locals.supabase, locals.activeOrgId) };
};
