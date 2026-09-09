import { fail, redirect } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import { recordTerms } from '$lib/crm/records';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { slideBuilderSchema } from '$lib/schemas/decks';
import { getDeck, saveDeck } from '$lib/server/crm/slides';
import { loadVocabulary } from '$lib/server/features';
import { hasGrant, requirePermission } from '$lib/server/roles';
import { samplePresentation } from '$lib/slides/sample';
import type { Actions, PageServerLoad } from './$types';

/**
 * The slide builder: the one screen where an org arranges the deck every
 * proposal is presented through. Gated by the hook on the proposals
 * feature; editing takes `manage`. The deck is the form — one JSON document
 * posted whole (`dataType: 'json'`, like /proposals/new) and validated by
 * `slideBuilderSchema` before `saveDeck()` upserts it on the org.
 *
 * The page previews slides over a sample presentation so a per-option slide
 * shows options and a bound heading shows a name; the sample's words come
 * from the org's own vocabulary, so a dental practice sees "Provider".
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	requirePermission(org.access, 'proposals', 'manage');
	depends(QUERY.slides);

	const { activeOrg, features, access } = org;
	const terms = recordTerms(
		visibleTerms(features, (featureId) => hasGrant(access, featureId)),
		'proposal'
	);
	const [deck, vocabulary] = await Promise.all([
		getDeck(supabase, activeOrgId),
		loadVocabulary(supabase, activeOrg.industryId)
	]);

	return {
		form: await superValidate({ deck }, zod4(slideBuilderSchema), { errors: false }),
		sample: samplePresentation({ name: activeOrg.name }, terms.noun, {
			presenter: vocabulary.proposal_presenter,
			responsible: vocabulary.proposal_responsible
		})
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const { supabase, org, activeOrgId, user } = locals;
		if (!org || !activeOrgId || !user) throw redirect(303, '/login');
		requirePermission(org.access, 'proposals', 'manage');

		const form = await superValidate(request, zod4(slideBuilderSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await saveDeck(supabase, activeOrgId, user.id, form.data.deck);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'The deck was not saved.', {
				status: 400
			});
		}
		return message(form, 'Saved');
	}
};
