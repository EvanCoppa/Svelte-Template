import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { can } from '$lib/server/roles';
import { loadRecordList } from '$lib/server/lists';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `proposals` feature + read grant; see companies.
// What the page is called — Proposals, Quotes, Treatment plans — is the
// feature's word as the org's industry says it (the pages row has no title
// of its own), so nothing here names it.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId || !locals.org) throw redirect(303, '/login');
	depends(QUERY.proposals);

	return {
		...(await loadRecordList(locals, 'proposal')),
		// Creating is the builder page at ./new, not the generic record form: a
		// proposal is options and lines, not one row of strings. The button
		// links there for whoever may write the feature; the builder's own load
		// refuses everyone else.
		canCreate: can(locals.org.access, 'proposals', 'manage')
	};
};
