import { error, redirect } from '@sveltejs/kit';
import { recordTerms } from '$lib/crm/records';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { getDeck, loadPresentation } from '$lib/server/crm/slides';
import { loadVocabulary } from '$lib/server/features';
import { hasGrant } from '$lib/server/roles';
import { capitalize } from '$lib/utils.js';
import type { PageServerLoad } from './$types';

/**
 * The slideshow for one proposal: the org's deck, and the proposal read and
 * named for the slides. Gated by the hook on the proposals feature (the
 * path is under /proposals), so `read` is already proven. Two calls, and
 * the page turns them into slides with `$lib/slides/present`.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.slides);
	depends(QUERY.record('proposal', params.id));

	const { activeOrg, features, access } = org;
	const terms = recordTerms(
		visibleTerms(features, (featureId) => hasGrant(access, featureId)),
		'proposal'
	);
	const vocabulary = await loadVocabulary(supabase, activeOrg.industryId);
	const [deck, presentation] = await Promise.all([
		getDeck(supabase, activeOrgId),
		loadPresentation(supabase, activeOrgId, params.id, {
			orgName: activeOrg.name,
			noun: terms.noun,
			vocabulary
		})
	]);
	if (!presentation) throw error(404, `${capitalize(terms.noun)} not found.`);

	return { deck, presentation, title: `${presentation.proposal.title} — Present` };
};
