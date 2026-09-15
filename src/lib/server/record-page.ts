import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, RequestEvent } from '@sveltejs/kit';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { RECORD_KIND_META, recordListHref, recordTerms, type RecordKind } from '$lib/crm/records';
import { graphNodeId } from '$lib/crm/graph';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { listActivities } from '$lib/server/crm/activities';
import {
	createAddress,
	deleteAddress,
	getAddress,
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
import {
	describeCustomField,
	getRecord,
	listRecordNames,
	listRelatedRecords
} from '$lib/server/crm/records';
import { getRelationships } from '$lib/server/crm/relationships';
import {
	addTaskComment,
	deleteTaskComment,
	listTaskComments,
	updateTaskComment
} from '$lib/server/crm/task-comments';
import { listTagsFor } from '$lib/server/crm/tags';
import { noteAccess } from '$lib/server/notes';
import { isEditableRecordType, loadEditRecord, updateRecord } from '$lib/server/records';
import { loadVocabulary } from '$lib/server/features';
import { geocode } from '$lib/server/geocode';
import { getDisplayNames } from '$lib/server/profiles';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import { capitalize } from '$lib/utils.js';
import { addressSchema, locateAddressSchema, removeAddressSchema } from '$lib/schemas/addresses';
import { imageUploadSchema, removeImageSchema } from '$lib/schemas/entity-images';
import { RELATIONSHIP_OTHER_KINDS, type RelationshipOtherKind } from '$lib/schemas/relationships';
import { removeTaskCommentSchema, taskCommentSchema } from '$lib/schemas/task-comments';
import { loadRelationshipPickers, relationshipActions } from './record-relationships';

/**
 * The record page, minus the route it is served on.
 *
 * Every record of every kind opens on a page with the same bones: a header,
 * the tabs, and the rail — over the same handful of reads, because
 * everything that attaches to a record hangs off the shared entity link
 * (`$lib/server/crm/entity`). This module is those bones, so a kind that
 * earns a page of its own (`(app)/companies/[id=guid]`, the rule in
 * `$lib/crm/records`) composes them rather than copying them, and the two
 * pages can never drift on what a record page shows.
 *
 * What is NOT here is what belongs to one kind: an invoice's lines and money
 * (`billing.server.ts`, beside the generic page), a company's people, money
 * and map. A specific page spreads `loadRecordPage()` and adds its own.
 *
 * Same contract as every other server module: the request-scoped client and
 * the active org id, RLS deciding what exists, and `canOpen` — derived from
 * the gate `hooks.server.ts` enforces — deciding whether a link to another
 * kind is drawn at all.
 */

/** Explicit form ids, shared by the load, the actions and each page's `superForm`s. */
export const RECORD_FORM_IDS = {
	address: 'address',
	removeAddress: 'remove-address',
	locateAddress: 'locate-address',
	image: 'entity-image',
	removeImage: 'remove-entity-image',
	comment: 'comment',
	removeComment: 'remove-comment'
} as const;

/**
 * Whether the kind has addresses at all — the database refuses one on
 * anything else, so this mirrors `addresses_entity_is_party_or_property`
 * exactly. Widen both together or the card silently stops being drawn for a
 * kind the table would happily accept.
 */
export function hasAddresses(kind: RecordKind): kind is 'company' | 'contact' | 'property' {
	return kind === 'company' || kind === 'contact' || kind === 'property';
}

/** Whether the kind has photos at all — mirrors `entity_images_entity_is_asset_or_property`. */
export function hasImages(kind: RecordKind): kind is 'asset' | 'property' {
	return kind === 'asset' || kind === 'property';
}

/**
 * Whether the kind has a conversation. Only a task so far; a ticket already
 * has its own thread table and joins by adding a branch here and in the two
 * comment actions, not by growing a second thread component.
 */
export function hasThread(kind: RecordKind): kind is 'task' {
	return kind === 'task';
}

/** Whether the reader may open a record of some other kind, on this request. */
export function recordGate(org: NonNullable<App.Locals['org']>) {
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	return {
		canRead,
		canOpen: (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead)
	};
}

/**
 * Everything a record page shows about one record, whichever route serves
 * it. The caller has already been gated by the hook on the kind's own list
 * prefix, so there is no check here — only the reads, and `canOpen` deciding
 * which of them happen at all.
 */
export async function loadRecordPage(
	locals: App.Locals,
	kind: RecordKind,
	id: string,
	depends: (...deps: string[]) => void
) {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');

	depends(QUERY.record(kind, id));
	// A note written here is written through the same endpoint as one written
	// from the dock, so this page refreshes on the same key they all share.
	depends(QUERY.notes);

	const { features } = org;
	const { canRead, canOpen } = recordGate(org);

	// Everything that attaches to a record hangs off the shared entity link, so
	// the same handful of reads serve every kind; what differs is which kinds
	// the database lets carry an address or a photo.
	const entity = { entityType: kind, entityId: id };
	const addressable = hasAddresses(kind);
	const imageable = hasImages(kind);
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
		relationshipPickers
	] = await Promise.all([
		getRecord(supabase, activeOrgId, kind, id, canOpen, vocabulary),
		listActivities(supabase, activeOrgId, { entity }),
		listTagsFor(supabase, activeOrgId, entity),
		addressable ? listAddresses(supabase, activeOrgId, entity) : [],
		imageable ? listEntityImages(supabase, activeOrgId, entity) : [],
		listCustomFields(supabase, activeOrgId, entity),
		listRelatedRecords(supabase, activeOrgId, kind, id, canOpen),
		// The graph: every relationship this record stands in, from either
		// side, oriented and named by the one module that knows how. A task's
		// assignees are in here, which is why it needs no field of its own.
		getRelationships(supabase, activeOrgId, entity, canOpen, vocabulary),
		notesShown ? listNotes(supabase, activeOrgId, { entity, archived: false }) : [],
		threaded ? listTaskComments(supabase, activeOrgId, id) : [],
		// The Relationships card's write side: which type-and-direction
		// choices fit this record, and whether this reader may draw one.
		loadRelationshipPickers(locals, kind, canOpen)
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

	// The record's own edit form and the address, image and comment forms, in
	// one round trip — all of them for a reader who may manage the record; the
	// actions refuse everyone else anyway. `type` travels with the edit form so
	// the page never has to narrow the kind again: this is where "this kind is
	// editable" was decided. An invoice is not one of them: its record page
	// already edits it through its own lifecycle actions.
	const [
		edit,
		addressForm,
		removeAddressForm,
		locateAddressForm,
		imageForm,
		removeImageForm,
		commentForm,
		removeCommentForm
	] = await Promise.all([
		isEditableRecordType(kind)
			? loadEditRecord(locals, kind, id).then((loaded) => ({ type: kind, ...loaded }))
			: null,
		superValidate(zod4(addressSchema), { id: RECORD_FORM_IDS.address }),
		superValidate(zod4(removeAddressSchema), { id: RECORD_FORM_IDS.removeAddress }),
		superValidate(zod4(locateAddressSchema), { id: RECORD_FORM_IDS.locateAddress }),
		superValidate(zod4(imageUploadSchema), { id: RECORD_FORM_IDS.image }),
		superValidate(zod4(removeImageSchema), { id: RECORD_FORM_IDS.removeImage }),
		superValidate(zod4(taskCommentSchema), { id: RECORD_FORM_IDS.comment }),
		superValidate(zod4(removeTaskCommentSchema), { id: RECORD_FORM_IDS.removeComment })
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
		locateAddressForm,
		// Whether this KIND can carry one at all, shipped rather than
		// re-derived in the page: the rule mirrors a database constraint, and
		// a second copy in the markup is how a widened constraint silently
		// fails to reach the screen.
		hasAddresses: addressable,
		canManageAddresses: addressable && can(org.access, RECORD_KIND_META[kind].feature, 'manage'),
		images,
		imageForm,
		removeImageForm,
		hasImages: imageable,
		canManageImages: imageable && can(org.access, RECORD_KIND_META[kind].feature, 'manage'),
		customFields: customFields.map(describeCustomField),
		related,
		relationships,
		relationshipTypeOptions: relationshipPickers.relationshipTypeOptions,
		relationshipOtherKinds: relationshipPickers.otherKinds,
		canManageRelationships: relationshipPickers.canManageRelationships,
		relationshipForms: relationshipPickers.relationshipForms,
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
		people,
		// The record's name titles the page and names its crumb — see
		// `titleFor()` in $lib/features/pages.
		title: record.name
	};
}

/**
 * Which kind of record a request is about. The generic page reads it off the
 * matched segment; a specific page already knows.
 */
export type RecordKindOf = (event: { params: Partial<Record<string, string>> }) => RecordKind;

type PageEvent = Pick<RequestEvent, 'request' | 'locals'> & {
	params: Partial<Record<string, string>>;
};

/**
 * The org and the task this request comments on. Posting needs no grant
 * beyond being able to open the record: a conversation is participation, not
 * editing, and a Viewer who cannot reply is a Viewer nobody talks to. Which
 * messages may be changed is RLS's answer — author, or owner/admin.
 */
function threadOf(locals: App.Locals, kind: RecordKind, id: string) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	if (!hasThread(kind)) throw error(400, 'This kind of record has no conversation.');
	return { supabase, orgId: activeOrgId, taskId: id };
}

/** The org and the record whose addresses this request edits, or the refusal the hook would give. */
function addressableOf(locals: App.Locals, kind: RecordKind, id: string) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	if (!hasAddresses(kind))
		throw error(400, 'Only a company, a contact or a property has addresses.');
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: id } };
}

/** The org and the record whose photos this request edits, or the refusal the hook would give. */
function imageableOf(locals: App.Locals, kind: RecordKind, id: string) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	if (!hasImages(kind)) throw error(400, 'Only an asset or a property has photos.');
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: id } };
}

/** The id of the record on screen — the second half of every action's address. */
function recordIdOf(params: Partial<Record<string, string>>): string {
	const { id } = params;
	if (!id) throw error(400, 'No record was named.');
	return id;
}

/** Blank is not a value: an untouched field becomes a null column. */
function text(value: string): string | null {
	return value === '' ? null : value;
}

/**
 * The actions every record page has: the record's own fields through the
 * generic form, its addresses, its photos, its conversation and its
 * relationships. A route spreads them beside whatever is its own —
 * `...recordPageActions(() => 'company')` on a page that serves one kind,
 * or a resolver off the matched segment on the generic one.
 */
export function recordPageActions(kindOf: RecordKindOf): Actions {
	const at = (event: PageEvent) => ({ kind: kindOf(event), id: recordIdOf(event.params) });

	return {
		/**
		 * The record's own fields, through the same registry, schema and switch
		 * that create it. Refuses a kind the generic form does not write rather
		 * than half-saving one, and `updateRecord()` re-checks `manage` itself.
		 */
		edit: async (event) => {
			const { kind, id } = at(event);
			if (!isEditableRecordType(kind)) {
				throw error(400, 'This kind of record is not edited from this form.');
			}
			return updateRecord(event, kind, id);
		},

		saveAddress: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId, entity } = addressableOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(addressSchema), {
				id: RECORD_FORM_IDS.address
			});
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
				return message(
					form,
					cause instanceof Error ? cause.message : 'Could not save the address.',
					{ status: 400 }
				);
			}
			return { form };
		},

		saveComment: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId, taskId } = threadOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(taskCommentSchema), {
				id: RECORD_FORM_IDS.comment
			});
			if (!form.valid) return fail(400, { form });

			const { id, body } = form.data;
			try {
				if (id === '') await addTaskComment(supabase, orgId, { task_id: taskId, body });
				else await updateTaskComment(supabase, orgId, id, { body });
			} catch (cause) {
				return message(
					form,
					cause instanceof Error ? cause.message : 'Could not post the message.',
					{ status: 400 }
				);
			}
			return { form };
		},

		removeComment: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId } = threadOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(removeTaskCommentSchema), {
				id: RECORD_FORM_IDS.removeComment
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

		// Re-geocode a saved address — the "Locate" chip an address with no pin
		// wears. Re-reads the row rather than trusting posted lines, then writes
		// only the coordinates a fresh geocode() found.
		locateAddress: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId, entity } = addressableOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(locateAddressSchema), {
				id: RECORD_FORM_IDS.locateAddress
			});
			if (!form.valid) return fail(400, { form });

			try {
				const address = await getAddress(supabase, orgId, form.data.id);
				const geo = await geocode({
					line1: address.line1,
					line2: address.line2,
					city: address.city,
					region: address.region,
					postal_code: address.postal_code,
					country: address.country
				});
				if (!geo.ok) return message(form, geo.error, { status: 400 });
				await updateAddress(supabase, orgId, entity, address.id, {
					kind: address.kind,
					label: address.label,
					line1: address.line1,
					line2: address.line2,
					city: address.city,
					region: address.region,
					postal_code: address.postal_code,
					country: address.country,
					latitude: geo.latitude,
					longitude: geo.longitude,
					is_primary: address.is_primary
				});
			} catch (cause) {
				return message(
					form,
					cause instanceof Error ? cause.message : 'Could not locate the address.',
					{ status: 400 }
				);
			}
			return { form };
		},

		removeAddress: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId } = addressableOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(removeAddressSchema), {
				id: RECORD_FORM_IDS.removeAddress
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

		uploadImage: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId, entity } = imageableOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(imageUploadSchema), {
				id: RECORD_FORM_IDS.image
			});
			// `form.data.file` is a `File`, which devalue cannot serialise — an
			// action returning one answers 500 however well the upload went.
			// Every exit that carries this form goes through `withFiles()`,
			// which drops it; `message()` already does the same on its own.
			if (!form.valid) return fail(400, withFiles({ form }));

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
			return withFiles({ form });
		},

		removeImage: async (event) => {
			const { kind, id: recordId } = at(event);
			const { supabase, orgId } = imageableOf(event.locals, kind, recordId);
			const form = await superValidate(event.request, zod4(removeImageSchema), {
				id: RECORD_FORM_IDS.removeImage
			});
			if (!form.valid) return fail(400, { form });

			try {
				await deleteEntityImage(supabase, orgId, form.data.id);
			} catch (cause) {
				return message(
					form,
					cause instanceof Error ? cause.message : 'Could not remove the photo.',
					{ status: 400 }
				);
			}
			return { form };
		},

		// Drawing and removing a relationship, across any kind.
		...relationshipActions(kindOf)
	};
}

const OTHER_KINDS = new Set<string>(RELATIONSHIP_OTHER_KINDS);

/**
 * The record picker behind the Relationships card's "Add relationship" form:
 * every name of one kind, fetched only once the reader has chosen that kind.
 * A JS-triggered GET read rather than something the page's own load carries
 * on every visit — the kind isn't known until the reader picks a
 * relationship type, and most visits never open this control at all.
 *
 * The card fetches `relationship-options?kind=…` relative to the page it is
 * on, so every route with a record page has its own endpoint over this one
 * body.
 */
export async function relationshipOptions(
	locals: App.Locals,
	kind: RecordKind,
	url: URL
): Promise<{ value: string; label: string }[]> {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw error(401, 'Sign in required.');

	// The same gate the action takes: only a reader who may draw a
	// relationship on this record needs to see who it could point at.
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');

	const otherKindParam = url.searchParams.get('kind');
	if (!otherKindParam || !OTHER_KINDS.has(otherKindParam)) {
		throw error(400, 'Unknown kind.');
	}
	// SAFETY: just checked `otherKindParam` is a member of `OTHER_KINDS`, the
	// runtime set built from `RELATIONSHIP_OTHER_KINDS`.
	const otherKind = otherKindParam as RelationshipOtherKind;

	// A member has no feature of their own — reading a colleague's name takes
	// no more than sharing an org with them, the roster's own rule.
	if (otherKind === 'member') {
		const members = await listStaff(supabase, activeOrgId);
		return members.map((member) => ({
			value: member.userId,
			label: member.displayName ?? member.email ?? 'Member'
		}));
	}

	const { canOpen } = recordGate(org);
	if (!canOpen(otherKind)) {
		throw error(403, 'You do not have access to this kind of record.');
	}

	const names = await listRecordNames(supabase, activeOrgId, otherKind);
	return names.map((row) => ({ value: row.id, label: row.name }));
}
