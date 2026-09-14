import { redirect } from '@sveltejs/kit';
import { RECORD_KIND_META, recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { mapConfig } from '$lib/map';
import { QUERY } from '$lib/queries';
import { listAddressesFor } from '$lib/server/crm/addresses';
import { listCompanies } from '$lib/server/crm/companies';
import type { ListResult } from '$lib/server/crm/lists';
import { pinsFor } from '$lib/server/crm/views';
import { loadList } from '$lib/server/lists';
import {
	createRecord,
	deleteRecord,
	loadCreateRecord,
	loadDeleteRecord
} from '$lib/server/records';
import { hasGrant } from '$lib/server/roles';
import type { Actions, PageServerLoad } from './$types';

// The hook already gated this route on the `companies` feature and the read
// grant. A company is a party — it can carry an address — so this list also
// draws as a map, the same pins mechanism a view uses (docs/views.md), rather
// than living as a second map-only page and nav entry of its own.
export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.companies);

	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	const result: Extract<ListResult, { kind: 'company' }> = {
		kind: 'company',
		rows: await listCompanies(supabase, activeOrgId)
	};
	const addresses = await listAddressesFor(
		supabase,
		activeOrgId,
		'company',
		result.rows.map((row) => row.id)
	);

	return {
		...(await loadList(locals, RECORD_KIND_META.company.feature, result)),
		pins: pinsFor(result, canOpen, addresses),
		// Null when there is no map configured; the layout toggle says so.
		map: mapConfig(),
		...(await loadCreateRecord(locals, 'company')),
		...(await loadDeleteRecord(locals, 'company'))
	};
};

// Two generic actions for every kind of record ($lib/server/records.ts); each
// opens with requirePermission(locals.org.access, 'companies', <level>).
export const actions: Actions = {
	create: (event) => createRecord(event, 'company'),
	deleteRecord: (event) => deleteRecord(event, 'company')
};
