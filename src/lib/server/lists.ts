import { redirect } from '@sveltejs/kit';
import { RECORD_KIND_META, recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { resolveList } from '$lib/lists/resolve';
import type { ListKind, ListRow, ListSpec } from '$lib/lists/types';
import { listAddressesFor } from './crm/addresses';
import { listCustomFieldDefinitions, listCustomFieldValuesFor } from './crm/custom-fields';
import { describeListRows, listNeeds, listRecords, resultIds, type ListResult } from './crm/lists';
import { resolveProposalParents, type ProposalParent } from './crm/records';
import { loadListRegistry } from './features';
import { getDisplayNames } from './profiles';
import { hasGrant } from './roles';

/**
 * The server half of a list page (`$lib/lists` is the client half;
 * `DataTable.Toolbar` is the chrome). Every list page's load is the same
 * line — `...(await loadRecordList(locals, 'company'))` — and a view's is
 * `loadList(locals, view.id, await runView(…))`: the rows the page shows,
 * already described, and the spec that says which columns, which of them
 * the search box scans and which get a filter, as the org's industry has it.
 *
 * The hook has already gated the route on the feature and the read grant;
 * this only reads. `canOpen` — whether a name here may link into its record
 * — is the hook's own decision for that kind's routes, so a view still
 * renders when its source feature is off for the org, with plain names.
 */

export type ListData = { list: { spec: ListSpec; rows: ListRow[] } };

/** A kind's own list page: every row of the kind, described for its feature's list. */
export async function loadRecordList(locals: App.Locals, kind: ListKind): Promise<ListData> {
	const { supabase, activeOrgId } = locals;
	if (!activeOrgId) throw redirect(303, '/login');
	return loadList(
		locals,
		RECORD_KIND_META[kind].feature,
		await listRecords(supabase, activeOrgId, kind)
	);
}

/** Rows already read (a view's), described for the list `featureId` owns. */
export async function loadList(
	locals: App.Locals,
	featureId: string,
	result: ListResult
): Promise<ListData> {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const { features, access, activeOrg } = org;
	const canRead = (id: string) => hasGrant(access, id);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	const [registry, customFields] = await Promise.all([
		loadListRegistry(supabase),
		listCustomFieldDefinitions(supabase, activeOrgId, result.kind)
	]);
	const spec = resolveList(result.kind, featureId, registry, activeOrg.industryId, customFields);

	// Only what the spec draws: a list with no city column reads no addresses.
	const needs = listNeeds(spec);
	const ids = resultIds(result);
	const [addresses, customValues, proposalParents, memberNames] = await Promise.all([
		needs.addresses ? listAddressesFor(supabase, activeOrgId, result.kind, ids) : [],
		needs.customValues ? listCustomFieldValuesFor(supabase, activeOrgId, result.kind, ids) : [],
		needs.proposalParents && result.kind === 'proposal'
			? resolveProposalParents(supabase, activeOrgId, result.rows)
			: new Map<string, ProposalParent>(),
		needs.memberNames && result.kind === 'proposal'
			? getDisplayNames(supabase, proposalMemberIds(result.rows))
			: new Map<string, string>()
	]);

	return {
		list: {
			spec,
			rows: describeListRows(result, spec, canOpen, {
				addresses,
				customValues,
				proposalParents,
				memberNames
			})
		}
	};
}

/** A proposal's presenter and owner ids, deduped and with the unset ones dropped. */
function proposalMemberIds(
	rows: readonly { presenter_id: string | null; responsible_id: string | null }[]
): string[] {
	const ids = new Set<string>();
	for (const row of rows) {
		if (row.presenter_id) ids.add(row.presenter_id);
		if (row.responsible_id) ids.add(row.responsible_id);
	}
	return [...ids];
}
