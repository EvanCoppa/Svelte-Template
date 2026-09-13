import { redirect } from '@sveltejs/kit';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { describeGraph } from '$lib/server/crm/graph';
import { loadVocabulary } from '$lib/server/features';
import { hasGrant } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

/**
 * The graph — every record that stands in a relationship and every
 * relationship between them, drawn as one map. Gated by the hook on the
 * `graph` feature + read grant; there is nothing to post, because a
 * relationship is drawn and removed where its record is.
 *
 * What is on the map is decided record by record, the way every link in
 * the app is: a kind the reader may not open is not fetched, so the map
 * shows exactly the records the reader could reach by clicking through.
 * `?focus=<kind>:<id>` opens the map on one record — the link a record's
 * Relationships card carries — and is honoured only when that record is
 * on the map.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	// The words on the map: each kind as the org's industry names it, the
	// member kind from the vocabulary.
	const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
	const graph = await describeGraph(
		supabase,
		activeOrgId,
		canOpen,
		vocabulary,
		visibleTerms(features, canRead)
	);

	const requested = url.searchParams.get('focus');
	const focus = requested && graph.nodes.some((node) => node.id === requested) ? requested : null;

	return { graph, focus };
};
