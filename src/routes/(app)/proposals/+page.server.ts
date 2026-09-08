import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listProposals } from '$lib/server/crm/proposals';
import { can } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `proposals` feature + read grant; see companies.
// What the page is called — Proposals, Quotes, Treatment plans — is the
// feature's word as the org's industry says it (the pages row has no title
// of its own), so nothing here names it.
//
// Creating is not the generic record form's job here: a proposal is born
// with its options, so the "Add …" button opens the builder at
// /proposals/new, which checks `manage` itself. The load only says whether
// to offer the button.
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, activeOrgId, org } = locals;
	if (!activeOrgId || !org) throw redirect(303, '/login');
	depends(QUERY.proposals);

	return {
		proposals: await listProposals(supabase, activeOrgId),
		canCreate: can(org.access, 'proposals', 'manage')
	};
};
