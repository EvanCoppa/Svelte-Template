import { error, fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { customFieldValueSchema } from '$lib/crm/custom-fields';
import {
	recordKindForSegment,
	recordListHref,
	recordTerms,
	RECORD_KIND_META,
	type RecordKind
} from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { listActivities } from '$lib/server/crm/activities';
import { listAddresses } from '$lib/server/crm/addresses';
import {
	clearCustomFieldValue,
	customFieldColumns,
	customFieldEntries,
	listCustomFields,
	setCustomFieldValue
} from '$lib/server/crm/custom-fields';
import { listNotes } from '$lib/server/crm/notes';
import { describeCustomField, getRecord, listRelatedRecords } from '$lib/server/crm/records';
import { noteAccess } from '$lib/server/notes';
import { listTagsFor } from '$lib/server/crm/tags';
import { loadVocabulary } from '$lib/server/features';
import { getDisplayNames } from '$lib/server/profiles';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { capitalize } from '$lib/utils.js';
import { customFieldValueFormSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

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
	const isParty = kind === 'company' || kind === 'contact';
	// Notes are the general table, not a CRM one: a record shows the ones
	// pointed at it, and only when this session has the feature at all.
	const notesShown = passesFeatureGate('/notes', features, canRead);
	// The words the record's labels use — who presents a proposal, who is
	// responsible for it — as the org's industry says them.
	const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
	const [record, activities, tags, addresses, customFields, related, notes] = await Promise.all([
		getRecord(supabase, activeOrgId, kind, id, canOpen, vocabulary),
		listActivities(supabase, activeOrgId, { entity }),
		listTagsFor(supabase, activeOrgId, entity),
		isParty ? listAddresses(supabase, activeOrgId, entity) : [],
		listCustomFields(supabase, activeOrgId, entity),
		listRelatedRecords(supabase, activeOrgId, kind, id, canOpen),
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

	return {
		record,
		activities,
		tags,
		addresses,
		// Two shapes of the same fields: one for showing (a FieldValue the page
		// never inspects) and one for editing (the string the form posts).
		customFields: customFields.map(describeCustomField),
		customFieldEntries: customFieldEntries(customFields),
		customFieldForm: await superValidate(zod4(customFieldValueFormSchema)),
		// Editing a record's cell is editing the record — the permission the
		// generic create form asks for on the same feature.
		canEditFields: can(access, RECORD_KIND_META[kind].feature, 'manage'),
		related,
		// The same shape the shell ships to the dock, so a note behaves the
		// same here as it does there.
		notes: notesShown ? { open: notes, ...noteAccess(org, user.id) } : null,
		people,
		// The record's name titles the page and names its crumb — see
		// `titleFor()` in $lib/features/pages.
		title: record.name
	};
};

export const actions: Actions = {
	/**
	 * One custom field of this record. The value arrives as a string and is
	 * checked against the definition's own type here, where the definition is
	 * known — the boundary `$lib/server/records.ts` has for a created record.
	 *
	 * A form action rather than an endpoint: the form is on the page it posts
	 * from and its data comes from form inputs, which is the rule with no
	 * exception (see "Server actions vs API endpoints").
	 */
	saveCustomField: async ({ request, locals, params }) => {
		const { supabase, org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');

		const kind = recordKindForSegment(params.kind);
		requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');

		const form = await superValidate(request, zod4(customFieldValueFormSchema));
		if (!form.valid) return fail(400, { form });

		const entity = { entityType: kind, entityId: params.id };
		const fields = await listCustomFields(supabase, activeOrgId, entity);
		const definition = fields.find(
			(field) => field.definition.id === form.data.field_definition_id
		)?.definition;
		// Not this kind's field, not this org's, or removed since the page loaded.
		if (!definition) return message(form, 'That field no longer exists.', { status: 400 });

		try {
			if (form.data.value === '') {
				await clearCustomFieldValue(supabase, activeOrgId, entity, definition.id);
			} else {
				const parsed = customFieldValueSchema(definition).safeParse(form.data.value);
				if (!parsed.success) {
					return setError(form, 'value', parsed.error.issues[0].message);
				}
				await setCustomFieldValue(
					supabase,
					activeOrgId,
					entity,
					definition.id,
					customFieldColumns(definition.value_type, parsed.data)
				);
			}
		} catch (cause) {
			// Carries the value trigger's own words — a choice outside the list
			// says so rather than becoming a 500.
			return message(form, cause instanceof Error ? cause.message : 'Could not save the field.', {
				status: 400
			});
		}
		return { form };
	}
};
