import { error, redirect } from '@sveltejs/kit';
import {
	RECORD_KIND_META,
	recordKindForSegment,
	recordListHref,
	type RecordKind
} from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listActivities } from '$lib/server/crm/activities';
import { listAddresses } from '$lib/server/crm/addresses';
import { listCustomFields } from '$lib/server/crm/custom-fields';
import { describeCustomField, getRecord, listRelatedRecords } from '$lib/server/crm/records';
import { listTagsFor } from '$lib/server/crm/tags';
import { getDisplayNames } from '$lib/server/profiles';
import { hasGrant } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

/**
 * The generic record page — the default page for one record of any kind.
 *
 * `/contacts/<id>`, `/products/<id>`, `/companies/<id>` and the rest all land
 * here: the `[kind=record]` matcher accepts exactly the list routes in
 * `$lib/crm/records`, and `[id=guid]` a Postgres uuid. Sitting under each
 * kind's list route is what gates it — the hook already decides whether this
 * session may open anything under `/contacts`, so the page needs no check of
 * its own, and nothing about it is registered in `pages`: its title is the
 * record's name (the record-title exception in the pages migration), and
 * until then the shell titles it after the list it belongs to.
 *
 * When a kind earns a page of its own, it goes at
 * `src/routes/(app)/<kind>/[id]/`; a static segment outranks `[kind=record]`,
 * so the specific page takes over and this one stays the default for the rest.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const kind = recordKindForSegment(params.kind);
	const { id } = params;
	depends(QUERY.record(kind, id));

	// Whether the reader may open a record of another kind: the same decision
	// the hook makes for that kind's routes, so a link here is never a link to
	// a refusal, and a related-records group nobody may open is never fetched.
	const { features, access } = org;
	const canOpen = (other: RecordKind) =>
		passesFeatureGate(recordListHref(other), features, (featureId) => hasGrant(access, featureId));

	// Everything the CRM attaches to a record hangs off the shared entity link,
	// so the same six reads serve every kind; only a party has addresses.
	const entity = { entityType: kind, entityId: id };
	const isParty = kind === 'company' || kind === 'contact';
	const [record, activities, tags, addresses, customFields, related] = await Promise.all([
		getRecord(supabase, activeOrgId, kind, id, canOpen),
		listActivities(supabase, activeOrgId, { entity }),
		listTagsFor(supabase, activeOrgId, entity),
		isParty ? listAddresses(supabase, activeOrgId, entity) : [],
		listCustomFields(supabase, activeOrgId, entity),
		listRelatedRecords(supabase, activeOrgId, kind, id, canOpen)
	]);
	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!record) throw error(404, `${RECORD_KIND_META[kind].noun} not found.`);

	// Everyone the page names — who created it, who it is assigned to, who
	// logged each activity — resolved in one query.
	const people = await getDisplayNames(
		supabase,
		[
			record.createdBy,
			...record.fields.map((field) => (field.value.type === 'person' ? field.value.userId : null)),
			...activities.map((activity) => activity.author_id)
		].filter((userId): userId is string => userId !== null)
	);

	return {
		record,
		activities,
		tags,
		addresses,
		customFields: customFields.map(describeCustomField),
		related,
		people,
		// The record's name titles the page and names its crumb — see
		// `titleFor()` in $lib/features/pages.
		title: record.name
	};
};
