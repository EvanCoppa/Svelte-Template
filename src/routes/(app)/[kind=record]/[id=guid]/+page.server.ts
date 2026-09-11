import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	RECORD_KIND_META,
	recordKindForSegment,
	recordListHref,
	recordTerms,
	type RecordKind,
	type RecordSegment
} from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { listActivities } from '$lib/server/crm/activities';
import {
	createAddress,
	deleteAddress,
	listAddresses,
	updateAddress
} from '$lib/server/crm/addresses';
import { listCustomFields } from '$lib/server/crm/custom-fields';
import { listNotes } from '$lib/server/crm/notes';
import { describeCustomField, getRecord, listRelatedRecords } from '$lib/server/crm/records';
import { getRelationships } from '$lib/server/crm/relationships';
import { noteAccess } from '$lib/server/notes';
import { listTagsFor } from '$lib/server/crm/tags';
import { loadVocabulary } from '$lib/server/features';
import { geocode } from '$lib/server/geocode';
import { getDisplayNames } from '$lib/server/profiles';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { capitalize } from '$lib/utils.js';
import type { Actions, PageServerLoad } from './$types';
import { addressSchema, removeAddressSchema } from '$lib/schemas/addresses';

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
 *
 * The one thing edited here is a party's addresses — the form below, whose
 * action geocodes what it saves so the record can sit on a view's map.
 */

/** Explicit form ids, shared by the load, the actions and the page's `superForm`s. */
const FORM_IDS = { address: 'address', removeAddress: 'remove-address' } as const;

/** Whether the kind has addresses at all — the database refuses one on anything else. */
function isParty(kind: RecordKind): kind is 'company' | 'contact' {
	return kind === 'company' || kind === 'contact';
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');

	const kind = recordKindForSegment(params.kind);
	const { id } = params;
	depends(QUERY.record(kind, id));
	// A note written here is written through the same endpoint as one written
	// from the dock, so this page refreshes on the same key they all share.
	depends(QUERY.notes);

	// Whether the reader may open a record of another kind: the same decision
	// the hook makes for that kind's routes, so a link here is never a link to
	// a refusal, and a related-records group nobody may open is never fetched.
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (other: RecordKind) =>
		passesFeatureGate(recordListHref(other), features, canRead);

	// Everything that attaches to a record hangs off the shared entity link, so
	// the same handful of reads serve every kind; only a party has addresses.
	const entity = { entityType: kind, entityId: id };
	const party = isParty(kind);
	// Notes are the general table, not a CRM one: a record shows the ones
	// pointed at it, and only when this session has the feature at all.
	const notesShown = passesFeatureGate('/notes', features, canRead);
	// The words the record's labels use — who presents a proposal, who is
	// responsible for it — as the org's industry says them.
	const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
	const [record, activities, tags, addresses, customFields, related, relationships, notes] =
		await Promise.all([
			getRecord(supabase, activeOrgId, kind, id, canOpen, vocabulary),
			listActivities(supabase, activeOrgId, { entity }),
			listTagsFor(supabase, activeOrgId, entity),
			party ? listAddresses(supabase, activeOrgId, entity) : [],
			listCustomFields(supabase, activeOrgId, entity),
			listRelatedRecords(supabase, activeOrgId, kind, id, canOpen),
			// The graph: every relationship this record stands in, from either
			// side, oriented and named by the one module that knows how.
			getRelationships(supabase, activeOrgId, entity, canOpen, vocabulary),
			notesShown ? listNotes(supabase, activeOrgId, { entity, archived: false }) : []
		]);
	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	// Named the way the org's industry names the kind: "Quote not found."
	if (!record) {
		const { noun } = recordTerms(visibleTerms(features, canRead), kind);
		throw error(404, `${capitalize(noun)} not found.`);
	}

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

	// The address forms, for a party the reader may manage; the action
	// refuses everyone else anyway.
	const [addressForm, removeAddressForm] = await Promise.all([
		superValidate(zod4(addressSchema), { id: FORM_IDS.address }),
		superValidate(zod4(removeAddressSchema), { id: FORM_IDS.removeAddress })
	]);

	return {
		record,
		activities,
		tags,
		addresses,
		addressForm,
		removeAddressForm,
		canManageAddresses: party && can(access, RECORD_KIND_META[kind].feature, 'manage'),
		customFields: customFields.map(describeCustomField),
		related,
		relationships,
		// The same shape the shell ships to the dock, so a note behaves the
		// same here as it does there.
		notes: notesShown ? { open: notes, ...noteAccess(org, user.id) } : null,
		people,
		// The record's name titles the page and names its crumb — see
		// `titleFor()` in $lib/features/pages.
		title: record.name
	};
};

/** The org and the party this request edits, or the refusal the hook would give. */
function partyOf(locals: App.Locals, params: { kind: RecordSegment; id: string }) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!isParty(kind)) throw error(400, 'Only a company or a contact has addresses.');
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: params.id } };
}

export const actions: Actions = {
	saveAddress: async ({ request, locals, params }) => {
		const { supabase, orgId, entity } = partyOf(locals, params);
		const form = await superValidate(request, zod4(addressSchema), { id: FORM_IDS.address });
		if (!form.valid) return fail(400, { form });

		const { id, ...posted } = form.data;
		const lines = {
			line1: posted.line1,
			line2: text(posted.line2),
			city: text(posted.city),
			region: text(posted.region),
			postal_code: text(posted.postal_code),
			country: text(posted.country)
		};
		// Coordinates are a courtesy the map needs, never a condition of
		// saving: a geocoder that is off, down or stumped leaves them null and
		// the address still lands.
		const geo = await geocode(lines);
		if (!geo.ok) console.warn(`[geocode] ${geo.error}`);
		const values = {
			...lines,
			kind: posted.kind,
			label: text(posted.label),
			is_primary: posted.is_primary,
			latitude: geo.ok ? geo.latitude : null,
			longitude: geo.ok ? geo.longitude : null
		};

		try {
			if (id === '') await createAddress(supabase, orgId, entity, values);
			else await updateAddress(supabase, orgId, entity, id, values);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the address.', {
				status: 400
			});
		}
		return { form };
	},

	removeAddress: async ({ request, locals, params }) => {
		const { supabase, orgId } = partyOf(locals, params);
		const form = await superValidate(request, zod4(removeAddressSchema), {
			id: FORM_IDS.removeAddress
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteAddress(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not remove the address.',
				{ status: 400 }
			);
		}
		return { form };
	}
};

/** Blank is not a value: an untouched field becomes a null column. */
function text(value: string): string | null {
	return value === '' ? null : value;
}
