import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listContacts } from '$lib/server/crm/contacts';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `contacts` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.contacts);

	return { contacts: await listContacts(locals.supabase, locals.activeOrgId) };
};
