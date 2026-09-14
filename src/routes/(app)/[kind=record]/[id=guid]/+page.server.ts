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
import { graphNodeId } from '$lib/crm/graph';
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
import {
	createEntityImage,
	deleteEntityImage,
	listEntityImages
} from '$lib/server/crm/entity-images';
import { listNotes } from '$lib/server/crm/notes';
import { describeCustomField, getRecord, listRelatedRecords } from '$lib/server/crm/records';
import { getRelationships } from '$lib/server/crm/relationships';
import {
	addTaskComment,
	deleteTaskComment,
	listTaskComments,
	updateTaskComment
} from '$lib/server/crm/task-comments';
import { noteAccess } from '$lib/server/notes';
import { isEditableRecordType, loadEditRecord, updateRecord } from '$lib/server/records';
import { listTagsFor } from '$lib/server/crm/tags';
import { loadVocabulary } from '$lib/server/features';
import { geocode } from '$lib/server/geocode';
import { getDisplayNames } from '$lib/server/profiles';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { capitalize } from '$lib/utils.js';
import type { Actions, PageServerLoad } from './$types';
import { billingActions, loadBilling } from './billing.server';
import { addressSchema, removeAddressSchema } from '$lib/schemas/addresses';
import { imageUploadSchema, removeImageSchema } from '$lib/schemas/entity-images';
import { removeTaskCommentSchema, taskCommentSchema } from '$lib/schemas/task-comments';

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
 * The record's own fields are edited here, through the generic form the list
 * pages create with — the registry describes a kind once and `EditRecord`
 * renders it, so a deal's stage moves from the same place a deal is named
 * (`$lib/server/records.ts`). Everything hanging off the record has its own
 * form beside it: a party's addresses, whose action geocodes what it saves so
 * the record can sit on a view's map, and an invoice's lines and payments,
 * which `billing.server.ts` keeps — the page draws that block whenever the
 * load supplies `billing`, a data-presence check like the thread's.
 */

/** Explicit form ids, shared by the load, the actions and the page's `superForm`s. */
const FORM_IDS = {
	address: 'address',
	removeAddress: 'remove-address',
	image: 'entity-image',
	removeImage: 'remove-entity-image',
	comment: 'comment',
	removeComment: 'remove-comment'
} as const;

/** Whether the kind has addresses at all — the database refuses one on anything else. */
function isParty(kind: RecordKind): kind is 'company' | 'contact' {
	return kind === 'company' || kind === 'contact';
}

/** Whether the kind has photos at all — the database refuses one on anything else. */
function isAsset(kind: RecordKind): kind is 'asset' {
	return kind === 'asset';
}

/**
 * Whether the kind has a conversation. Only a task so far; a ticket already
 * has its own thread table and joins by adding a branch here and in the two
 * comment actions, not by growing a second thread component.
 */
function hasThread(kind: RecordKind): kind is 'task' {
	return kind === 'task';
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
	// the same handful of reads serve every kind; only a party has addresses
	// and only an asset has photos.
	const entity = { entityType: kind, entityId: id };
	const party = isParty(kind);
	const asset = isAsset(kind);
	const threaded = hasThread(kind);
	// Notes are the general table, not a CRM one: a record shows the ones
	// pointed at it, and only when this session has the feature at all.
	const notesShown = passesFeatureGate('/notes', features, canRead);
	// The words the record's labels use — who presents a proposal, who is
	// responsible for it — as the org's industry says them.
	const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
	const [
		record,
		activities,
		tags,
		addresses,
		images,
		customFields,
		related,
		relationships,
		notes,
		messages,
		billing
	] = await Promise.all([
		getRecord(supabase, activeOrgId, kind, id, canOpen, vocabulary),
		listActivities(supabase, activeOrgId, { entity }),
		listTagsFor(supabase, activeOrgId, entity),
		party ? listAddresses(supabase, activeOrgId, entity) : [],
		asset ? listEntityImages(supabase, activeOrgId, entity) : [],
		listCustomFields(supabase, activeOrgId, entity),
		listRelatedRecords(supabase, activeOrgId, kind, id, canOpen),
		// The graph: every relationship this record stands in, from either
		// side, oriented and named by the one module that knows how. A task's
		// assignees are in here, which is why it needs no field of its own.
		getRelationships(supabase, activeOrgId, entity, canOpen, vocabulary),
		notesShown ? listNotes(supabase, activeOrgId, { entity, archived: false }) : [],
		threaded ? listTaskComments(supabase, activeOrgId, id) : [],
		// Null for every kind but an invoice; the block's own module decides.
		loadBilling(locals, params)
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

	// The record's own edit form, filled in from the row — for the kinds the
	// registry can write. An invoice is not one of them: its record page
	// already edits it through its own lifecycle actions.
	// The record's own edit form and the address, image and comment forms, in
	// one round trip — all of them for a reader who may manage the record; the
	// actions refuse everyone else anyway. `type` travels with the edit form so
	// the page never has to narrow the kind again: the load is where "this kind
	// is editable" was decided.
	const [
		edit,
		addressForm,
		removeAddressForm,
		imageForm,
		removeImageForm,
		commentForm,
		removeCommentForm
	] = await Promise.all([
		isEditableRecordType(kind)
			? loadEditRecord(locals, kind, id).then((loaded) => ({ type: kind, ...loaded }))
			: null,
		superValidate(zod4(addressSchema), { id: FORM_IDS.address }),
		superValidate(zod4(removeAddressSchema), { id: FORM_IDS.removeAddress }),
		superValidate(zod4(imageUploadSchema), { id: FORM_IDS.image }),
		superValidate(zod4(removeImageSchema), { id: FORM_IDS.removeImage }),
		superValidate(zod4(taskCommentSchema), { id: FORM_IDS.comment }),
		superValidate(zod4(removeTaskCommentSchema), { id: FORM_IDS.removeComment })
	]);

	return {
		record,
		// Null for a kind the generic form cannot write; the page draws the
		// button on the same data-presence rule the thread and the invoice
		// block follow.
		edit,
		activities,
		tags,
		addresses,
		addressForm,
		removeAddressForm,
		canManageAddresses: party && can(access, RECORD_KIND_META[kind].feature, 'manage'),
		images,
		imageForm,
		removeImageForm,
		canManageImages: asset && can(access, RECORD_KIND_META[kind].feature, 'manage'),
		customFields: customFields.map(describeCustomField),
		related,
		relationships,
		// The conversation, for the kinds that have one. `userId` and
		// `canModerate` are what the thread needs to decide which messages
		// offer edit and remove — the same two answers RLS gives.
		thread: threaded
			? {
					messages,
					form: commentForm,
					removeForm: removeCommentForm,
					userId: user.id,
					canModerate: org.activeOrg.role === 'owner' || org.activeOrg.role === 'admin'
				}
			: null,
		// The same shape the shell ships to the dock, so a note behaves the
		// same here as it does there.
		notes: notesShown ? { open: notes, ...noteAccess(org, user.id) } : null,
		// Where this record's relationships are drawn whole — when the graph is
		// a page this session may open (the same gate the hook applies to /graph).
		graphHref: passesFeatureGate('/graph', features, canRead)
			? `/graph?focus=${graphNodeId(kind, id)}`
			: null,
		// An invoice's lines and money, with the forms that change them.
		billing,
		people,
		// The record's name titles the page and names its crumb — see
		// `titleFor()` in $lib/features/pages.
		title: record.name
	};
};

/**
 * The org and the task this request comments on. Posting needs no grant
 * beyond being able to open the record: a conversation is participation, not
 * editing, and a Viewer who cannot reply is a Viewer nobody talks to. Which
 * messages may be changed is RLS's answer — author, or owner/admin.
 */
function threadOf(locals: App.Locals, params: { kind: RecordSegment; id: string }) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!hasThread(kind)) throw error(400, 'This kind of record has no conversation.');
	return { supabase, orgId: activeOrgId, taskId: params.id };
}

/** The org and the party this request edits, or the refusal the hook would give. */
function partyOf(locals: App.Locals, params: { kind: RecordSegment; id: string }) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!isParty(kind)) throw error(400, 'Only a company or a contact has addresses.');
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: params.id } };
}

/** The org and the asset this request edits, or the refusal the hook would give. */
function assetOf(locals: App.Locals, params: { kind: RecordSegment; id: string }) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!isAsset(kind)) throw error(400, 'Only an asset has photos.');
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: params.id } };
}

export const actions: Actions = {
	// The invoice block's nine actions — lines, header, lifecycle, money.
	...billingActions,

	/**
	 * The record's own fields, through the same registry, schema and switch
	 * that create it. Refuses a kind the generic form does not write rather
	 * than half-saving one, and `updateRecord()` re-checks `manage` itself.
	 */
	edit: async (event) => {
		const kind = recordKindForSegment(event.params.kind);
		if (!isEditableRecordType(kind)) {
			throw error(400, 'This kind of record is not edited from this form.');
		}
		return updateRecord(event, kind, event.params.id);
	},

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

	saveComment: async ({ request, locals, params }) => {
		const { supabase, orgId, taskId } = threadOf(locals, params);
		const form = await superValidate(request, zod4(taskCommentSchema), { id: FORM_IDS.comment });
		if (!form.valid) return fail(400, { form });

		const { id, body } = form.data;
		try {
			if (id === '') await addTaskComment(supabase, orgId, { task_id: taskId, body });
			else await updateTaskComment(supabase, orgId, id, { body });
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not post the message.', {
				status: 400
			});
		}
		return { form };
	},

	removeComment: async ({ request, locals, params }) => {
		const { supabase, orgId } = threadOf(locals, params);
		const form = await superValidate(request, zod4(removeTaskCommentSchema), {
			id: FORM_IDS.removeComment
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteTaskComment(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not remove the message.',
				{ status: 400 }
			);
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
	},

	uploadImage: async ({ request, locals, params }) => {
		const { supabase, orgId, entity } = assetOf(locals, params);
		const form = await superValidate(request, zod4(imageUploadSchema), { id: FORM_IDS.image });
		if (!form.valid) return fail(400, { form });

		try {
			await createEntityImage(supabase, orgId, entity, {
				file: form.data.file,
				caption: text(form.data.caption)
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not add the photo.', {
				status: 400
			});
		}
		return { form };
	},

	removeImage: async ({ request, locals, params }) => {
		const { supabase, orgId } = assetOf(locals, params);
		const form = await superValidate(request, zod4(removeImageSchema), {
			id: FORM_IDS.removeImage
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteEntityImage(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove the photo.', {
				status: 400
			});
		}
		return { form };
	}
};

/** Blank is not a value: an untouched field becomes a null column. */
function text(value: string): string | null {
	return value === '' ? null : value;
}
