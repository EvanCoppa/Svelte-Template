import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listProposals } from '$lib/server/crm/proposals';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import type { Actions, PageServerLoad } from './$types';

// Gated by the hook on the `proposals` feature + read grant; see companies.
// What the page is called — Proposals, Quotes, Treatment plans — is the
// feature's word as the org's industry says it (the pages row has no title
// of its own), so nothing here names it.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.proposals);

	return {
		proposals: await listProposals(locals.supabase, locals.activeOrgId),
		...(await loadCreateRecord(locals, 'proposal'))
	};
};

// Creating goes through the generic record form ($lib/server/records.ts), which
// opens with requirePermission(locals.org.access, 'proposals', 'manage').
export const actions: Actions = {
	create: (event) => createRecord(event, 'proposal')
};
