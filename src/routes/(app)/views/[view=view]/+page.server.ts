import { error, redirect } from '@sveltejs/kit';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { mapConfig } from '$lib/map';
import { QUERY } from '$lib/queries';
import { listAddressesFor } from '$lib/server/crm/addresses';
import { resultIds } from '$lib/server/crm/lists';
import { pinsFor, runView } from '$lib/server/crm/views';
import { loadViewRegistry } from '$lib/server/features';
import { loadList } from '$lib/server/lists';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { hasGrant } from '$lib/server/roles';
import { defaultsFor, resolveView, type ViewDefinition } from '$lib/views/resolve';
import type { Actions, PageServerLoad } from './$types';

/**
 * The one view page — every `views` row renders here.
 *
 * `/views/suppliers` is gated like any feature route: the view's feature row
 * claims exactly that route, so the hook has already decided whether this
 * session may see it (hidden → 404, locked → the upgrade prompt, no grant →
 * 403) and the `pages` row titles it. The load's job is the definition: find
 * the row for the slug, resolve it against the feature the org context
 * already holds, run it, and describe the result for the page — the rows as
 * the view's own list (`loadList()`, over the view's list_fields rows) and
 * pins typed by where they sit — so the page never learns which table it is
 * looking at.
 */
async function viewFor(locals: App.Locals, slug: string): Promise<ViewDefinition> {
	const { supabase, org } = locals;
	if (!org) throw redirect(303, '/login');
	const row = (await loadViewRegistry(supabase)).find((view) => view.id === slug);
	const resolved = row && org.features[row.id];
	// A slug no row claims, or one whose feature the gate never served (it
	// cannot happen for a row the registry lists, but the two lists are
	// separate reads) — both are "no such page", never a hint that one exists.
	if (!row || !resolved) throw error(404, 'Not found.');
	return resolveView(row, resolved.feature);
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const view = await viewFor(locals, params.view);
	// The source's own key, so a record added here (through the same generic
	// form the source's list page uses) refreshes this list with no new key.
	depends(QUERY[view.source === 'company' ? 'companies' : 'contacts']);

	// Whether a pin may link into its record: the hook's own decision for
	// that kind's routes, so a view still renders when its source feature is
	// off for the org — with plain names instead of links. The list makes the
	// same call for its rows.
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	const result = await runView(supabase, activeOrgId, view);
	// The map needs every address; the list reads its own when it has a city column.
	const addresses = await listAddressesFor(supabase, activeOrgId, view.source, resultIds(result));

	return {
		view,
		...(await loadList(locals, view.id, result)),
		pins: pinsFor(result, canOpen, addresses),
		// Null when there is no map configured; the map layout says so.
		map: mapConfig(),
		...(await loadCreateRecord(locals, view.source, { defaults: defaultsFor(view) }))
	};
};

// The generic create action, for the kind the view lists — re-resolved from
// the registry, never read from the post. It opens with
// requirePermission(locals.org.access, <source feature>, 'manage').
export const actions: Actions = {
	create: async (event) =>
		createRecord(event, (await viewFor(event.locals, event.params.view)).source)
};
