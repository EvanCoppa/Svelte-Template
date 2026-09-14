import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Database } from '$lib/database.types';
import { memberName } from '$lib/components/staff/member';
import { RECORD_KIND_META, type RecordKind } from '$lib/crm/records';
import {
	formatFix,
	parseFix,
	splitVisitSubject,
	visitSubjectKey,
	VISIT_SUBJECT_KINDS
} from '$lib/crm/visits';
import type { ListKind } from '$lib/lists/types';
import {
	assetRecordSchema,
	billableRecordSchema,
	companyRecordSchema,
	contactRecordSchema,
	couponRecordSchema,
	dealRecordSchema,
	deleteRecordSchema,
	invoiceRecordSchema,
	leaseRecordSchema,
	productRecordSchema,
	orderRecordSchema,
	purchaseRecordSchema,
	rmaRecordSchema,
	propertyRecordSchema,
	taskRecordSchema,
	ticketRecordSchema,
	visitRecordSchema,
	isRecordType,
	RECORD_FORMS,
	RECORD_PICKER_KINDS,
	RECORD_SCHEMAS,
	type RecordFieldOption,
	type RecordFormValues,
	type RecordPickerKind,
	type RecordPickers,
	type RecordType
} from '$lib/schemas/records';
import { createAsset, deleteAsset, getAsset, updateAsset } from './crm/assets';
import { createBillable, deleteBillable, getBillable, updateBillable } from './crm/billables';
import {
	createCompany,
	deleteCompany,
	getCompany,
	listCompanies,
	updateCompany
} from './crm/companies';
import {
	createContact,
	deleteContact,
	getContact,
	listContacts,
	updateContact
} from './crm/contacts';
import { createCoupon, deleteCoupon, getCoupon, updateCoupon } from './crm/coupons';
import { createDeal, dealPlacement, deleteDeal, getDeal, updateDeal } from './crm/deals';
import { createInvoice } from './crm/invoices';
import { createLease, deleteLease, getLease, updateLease } from './crm/leases';
import { listPipelines } from './crm/pipelines';
import { createProduct, deleteProduct, getProduct, updateProduct } from './crm/products';
import { createOrder, deleteOrder, getOrder, updateOrder } from './crm/orders';
import { createPurchase, deletePurchase, getPurchase, updatePurchase } from './crm/purchases';
import { deleteShipment } from './crm/shipments';
import { createRma, deleteRma, getRma, updateRma } from './crm/rmas';
import {
	createProperty,
	deleteProperty,
	getProperty,
	listProperties,
	updateProperty
} from './crm/properties';
import { deleteProposal } from './crm/proposals';
import { createTask, getTask, updateTask } from './crm/tasks';
import { createTicket, deleteTicket, getTicket, updateTicket } from './crm/tickets';
import { listRecordNames } from './crm/records';
import { createVisit, deleteVisit, getVisit, listVisitOutcomes, updateVisit } from './crm/visits';
import { can, requirePermission } from './roles';
import { listStaff } from './staff';

/**
 * The server half of the generic record form (`$lib/schemas/records.ts` is the
 * registry; `CreateRecord` and `EditRecord` are the components). Every list
 * page's `+page.server.ts` is the same two lines:
 *
 *   export const load = … ({ ...(await loadCreateRecord(locals, 'company')) })
 *   export const actions = { create: (event) => createRecord(event, 'company') };
 *
 * and the generic record page pairs them with the same two for editing
 * (`loadEditRecord` / `updateRecord`), so one implementation validates,
 * authorises and writes for every kind of record. Adding a kind of record is
 * a schema, a `RECORD_FORMS` entry and one `case` in `writeRecord()` — plus,
 * so the form can open filled in, its mirror in `recordFormValues()`.
 *
 * The hook has already gated the route on the feature and the read grant;
 * writing needs `manage`, checked here and backed by RLS.
 */

/**
 * One id for every create form. Superforms derives an id from the schema's
 * shape, and the generic form's schema is only known at runtime — naming it
 * keeps the posted form routing to itself, including on the no-JS path.
 */
export const CREATE_FORM_ID = 'create-record';

/**
 * A create form for `type`, for a list page's load — empty, or started from
 * `defaults` (a view pins the fields its filter fixes, so a record added from
 * "Vendors" is a supplier). Defaults are not errors, so the form opens clean.
 */
export function createRecordForm(
	type: RecordType,
	defaults: Partial<RecordFormValues> = {}
): Promise<SuperValidated<RecordFormValues>> {
	return superValidate(defaults, zod4(RECORD_SCHEMAS[type]), { id: CREATE_FORM_ID, errors: false });
}

/**
 * What a list page's load adds for its "Add …" button: the form, whether
 * this user may use it, and the options behind any party picker the form
 * has. A member without `manage` still reads the list; the button simply
 * isn't rendered, and the action refuses anyway — so the pickers are read
 * only for a writer, and only for the kinds the form points at.
 */
export async function loadCreateRecord(
	locals: App.Locals,
	type: RecordType,
	{ defaults = {} }: { defaults?: Partial<RecordFormValues> } = {}
): Promise<{
	createForm: SuperValidated<RecordFormValues>;
	canCreate: boolean;
	createPickers: RecordPickers;
}> {
	const { supabase, activeOrgId, org } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const canCreate = can(org.access, RECORD_FORMS[type].feature, 'manage');
	const [createForm, createPickers] = await Promise.all([
		createRecordForm(type, defaults),
		canCreate ? loadPickers(supabase, activeOrgId, type) : {}
	]);
	return { createForm, canCreate, createPickers };
}

/** The org's rows behind each party picker on the form for `type` — none for a form without one. */
export async function loadPickers(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType
): Promise<RecordPickers> {
	const wanted = RECORD_PICKER_KINDS.filter((kind) =>
		RECORD_FORMS[type].fields.some((field) => field.type === kind)
	);
	const loaded = await Promise.all(wanted.map((kind) => pickerOptions(supabase, orgId, kind)));
	return Object.fromEntries(wanted.map((kind, index) => [kind, loaded[index]]));
}

/** The options behind one picker kind — every row of the org's the picker may name. */
export async function pickerOptions(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: RecordPickerKind
): Promise<RecordFieldOption[]> {
	switch (kind) {
		case 'company':
			return (await listCompanies(supabase, orgId)).map((company) => ({
				value: company.id,
				label: company.name
			}));
		case 'contact':
			// A person at a company is shown with it, so two Dana Reyeses tell apart.
			return (await listContacts(supabase, orgId)).map((contact) => ({
				value: contact.id,
				label: contact.name,
				sublabel: contact.companies?.name ?? contact.email ?? undefined
			}));
		case 'stage':
			// Every board's stages, in board order then stage order, each
			// labelled with the board it belongs to — an org may run more than
			// one funnel, and "Approved" can sit on both.
			return (await listPipelines(supabase, orgId)).flatMap((pipeline) =>
				pipeline.pipeline_stages.map((stage) => ({
					value: stage.id,
					label: stage.name,
					sublabel: pipeline.name
				}))
			);
		case 'property': {
			// Buildings and units in one list, because they are one table — and
			// a unit is shown under the building it belongs to, so two
			// "Unit 1"s tell apart. One pass builds the name index, so the
			// sublabel costs no extra query.
			const rows = await listProperties(supabase, orgId);
			const names = new Map(rows.map((row) => [row.id, row.name]));
			return rows.map((row) => ({
				value: row.id,
				label: row.name,
				sublabel: row.parent_id
					? (names.get(row.parent_id) ?? undefined)
					: (row.property_type ?? undefined)
			}));
		}
		case 'subject': {
			// Every record you can go and see, in one list, each labelled with
			// what it is — one question, not two (the `subject` note in
			// `RECORD_PICKER_KINDS`). Read through `listRecordNames()`, which
			// is the one place a kind's rows become "an id and a name", so the
			// picker shows exactly what the record page will put at the top.
			const kinds = await Promise.all(
				VISIT_SUBJECT_KINDS.map(async (kind) => ({
					kind,
					rows: await listRecordNames(supabase, orgId, kind)
				}))
			);
			return kinds.flatMap(({ kind, rows }) =>
				rows.map((row) => ({
					value: visitSubjectKey(kind, row.id),
					label: row.name,
					sublabel: kind
				}))
			);
		}
		case 'outcome':
			return (await listVisitOutcomes(supabase, orgId)).map((outcome) => ({
				value: outcome.id,
				label: outcome.name
			}));
		case 'member':
			// Everyone who works here, named the way the roster names them, so
			// a picker, a task card and the staff page call the same person the
			// same thing.
			return (await listStaff(supabase, orgId)).map((member) => {
				const option: RecordFieldOption = { value: member.userId, label: memberName(member) };
				// The email tells two same-named colleagues apart — but only
				// where there is a display name, because otherwise it IS the label.
				if (member.displayName && member.email) option.sublabel = member.email;
				return option;
			});
	}
}

/** The `create` action every list page delegates to. */
export async function createRecord(
	event: Pick<RequestEvent, 'request' | 'locals'>,
	type: RecordType
) {
	const { request, locals } = event;
	const { supabase, activeOrgId, org } = locals;
	if (!activeOrgId || !org) throw redirect(303, '/login');

	requirePermission(org.access, RECORD_FORMS[type].feature, 'manage');

	const form = await superValidate(request, zod4(RECORD_SCHEMAS[type]), { id: CREATE_FORM_ID });
	if (!form.valid) return fail(400, { form });

	try {
		await writeRecord(supabase, activeOrgId, type, form.data);
	} catch (cause) {
		// The crm modules throw the PostgREST message (see crm/unwrap.ts) — a
		// duplicate SKU or a policy refusal belongs in the form, not a 500.
		return message(form, cause instanceof Error ? cause.message : 'Could not create the record.', {
			status: 400
		});
	}

	return { form };
}

// ---------------------------------------------------------------------------
// Editing one — the same registry, the same form, the same switch
// ---------------------------------------------------------------------------

/**
 * The kinds the generic form also EDITS: every creatable kind but an invoice.
 * An invoice is a document with a lifecycle rather than a row of fields —
 * draft, issued, void — and its record page already owns that (the
 * `billing.server.ts` actions, including a header form of its own). A second
 * way to edit the same row is the one thing this registry exists to prevent.
 */
export type EditableRecordType = Exclude<RecordType, 'invoice'>;

/** Whether a record page should offer the edit form for this kind. */
export function isEditableRecordType(kind: RecordKind): kind is EditableRecordType {
	return kind !== 'invoice' && isRecordType(kind);
}

/**
 * One id for every edit form, distinct from the create form's: a page may
 * hold both (a list page's "Add …" beside a record's "Edit"), and superforms
 * routes a post to the form whose id it names.
 */
export const EDIT_FORM_ID = 'edit-record';

/**
 * What a record page adds for its "Edit" button: the form filled in with what
 * the record says now, whether this user may save it, and the options behind
 * any picker. Only a writer's form is filled — a reader never sees the button
 * and the action refuses them anyway, so nothing is read on their behalf.
 */
export async function loadEditRecord(
	locals: App.Locals,
	type: EditableRecordType,
	id: string
): Promise<{
	editForm: SuperValidated<RecordFormValues>;
	canEdit: boolean;
	editPickers: RecordPickers;
}> {
	const { supabase, activeOrgId, org } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const canEdit = can(org.access, RECORD_FORMS[type].feature, 'manage');
	const [values, editPickers] = await Promise.all([
		canEdit ? recordFormValues(supabase, activeOrgId, type, id) : {},
		canEdit ? loadPickers(supabase, activeOrgId, type) : {}
	]);
	// A prefilled form opens clean: what the record already says is not a list
	// of mistakes (the superforms convention for an edit form).
	const editForm = await superValidate(values, zod4(RECORD_SCHEMAS[type]), {
		id: EDIT_FORM_ID,
		errors: false
	});
	return { editForm, canEdit, editPickers };
}

/** The `edit` action a record page delegates to. */
export async function updateRecord(
	event: Pick<RequestEvent, 'request' | 'locals'>,
	type: EditableRecordType,
	id: string
) {
	const { request, locals } = event;
	const { supabase, activeOrgId, org } = locals;
	if (!activeOrgId || !org) throw redirect(303, '/login');

	requirePermission(org.access, RECORD_FORMS[type].feature, 'manage');

	const form = await superValidate(request, zod4(RECORD_SCHEMAS[type]), { id: EDIT_FORM_ID });
	if (!form.valid) return fail(400, { form });

	try {
		await writeRecord(supabase, activeOrgId, type, form.data, id);
	} catch (cause) {
		return message(form, cause instanceof Error ? cause.message : 'Could not save the record.', {
			status: 400
		});
	}

	return { form };
}

/**
 * A field a writer named that the kind does not have. A throw rather than an
 * issue, because it is a mistake about the FORM rather than about a value —
 * and the message names the fields, so one retry can be right. Shared by the
 * two writers that are not forms: a form can only post the inputs it renders.
 */
function requireKnownFields(type: RecordType, values: Partial<RecordFormValues>): void {
	const fields = RECORD_FORMS[type].fields;
	const unknown = Object.keys(values).filter(
		(name) => !fields.some((field) => field.name === name)
	);
	if (unknown.length > 0) {
		throw new Error(
			`A ${type} has no field named ${unknown.join(', ')}. ` +
				`Its fields are: ${fields.map((field) => field.name).join(', ')}.`
		);
	}
}

/** What a partial edit came to: saved, or the validation it failed, as sentences. */
export type PatchResult = { saved: true } | { saved: false; issues: string[] };

/**
 * A partial edit for a writer that is not a form — the assistant. The edit
 * form posts every field, so a blank one means "clear it"; a tool names
 * only the fields it means to change, and the rest keep what the record
 * says now. Same registry, same schema and same `writeRecord()` switch as
 * the form, so a change is validated and written exactly as a person's
 * would be. A field the registry does not list is a call error (the model
 * can read the list and retry); a value the schema refuses comes back as
 * issues rather than a throw, because that is an answer, not a failure.
 * The caller checks `manage` first — this is the write, not the gate.
 */
export async function patchRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: EditableRecordType,
	id: string,
	changes: Partial<RecordFormValues>
): Promise<PatchResult> {
	requireKnownFields(type, changes);

	const current = await recordFormValues(supabase, orgId, type, id);
	if (Object.keys(current).length === 0) throw new Error(`There is no ${type} with id ${id}.`);

	const parsed = RECORD_SCHEMAS[type].safeParse({ ...current, ...changes });
	if (!parsed.success) {
		return {
			saved: false,
			issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
		};
	}
	await writeRecord(supabase, orgId, type, parsed.data, id);
	return { saved: true };
}

/** What a create by something other than a form came to: the row, or the validation it failed. */
export type InsertResult = { created: true; id: string } | { created: false; issues: string[] };

/**
 * A create for a writer that is not a form — the assistant. The create form
 * posts every field, blank ones included; a tool names only the fields it was
 * given and the schema's defaults fill in the rest, exactly as an untouched
 * input would have. Same registry, same schema and same `writeRecord()`
 * switch as the form, so a record made here is validated and written the way
 * a person's is — and a field the registry does not list is a call error the
 * model can read and retry, while a value the schema refuses comes back as
 * issues, because that is an answer rather than a failure.
 *
 * The caller checks `manage` first — this is the write, not the gate.
 */
export async function insertRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType,
	values: Partial<RecordFormValues>
): Promise<InsertResult> {
	requireKnownFields(type, values);

	const parsed = RECORD_SCHEMAS[type].safeParse(values);
	if (!parsed.success) {
		return {
			created: false,
			issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
		};
	}
	return { created: true, id: await writeRecord(supabase, orgId, type, parsed.data) };
}

// ---------------------------------------------------------------------------
// Deleting one — every list page's row menu
// ---------------------------------------------------------------------------

/**
 * The kinds a list page's row menu may delete: every kind with a list page
 * but an invoice, which is a document with a lifecycle (draft → issued →
 * void) rather than a row to discard — voiding is how an issued one goes
 * away, and a draft is removed from its own page, never a table.
 */
export type DeletableListKind = Exclude<ListKind, 'invoice'>;

/** One id for every delete form, distinct from the create and edit forms'. */
export const DELETE_FORM_ID = 'delete-record';

/** An empty delete form — every list page's load builds one for its row menu. */
export function deleteRecordForm(): Promise<SuperValidated<{ id: string }>> {
	return superValidate(zod4(deleteRecordSchema), { id: DELETE_FORM_ID, errors: false });
}

/** What a list page's load adds for its row menu's Delete: the form, and whether this reader may use it. */
export async function loadDeleteRecord(
	locals: App.Locals,
	kind: DeletableListKind
): Promise<{ deleteForm: SuperValidated<{ id: string }>; canDelete: boolean }> {
	const { org } = locals;
	if (!org) throw redirect(303, '/login');
	return {
		deleteForm: await deleteRecordForm(),
		canDelete: can(org.access, RECORD_KIND_META[kind].feature, 'delete')
	};
}

/** The `deleteRecord` action every list page delegates to. */
export async function deleteRecord(
	event: Pick<RequestEvent, 'request' | 'locals'>,
	kind: DeletableListKind
) {
	const { request, locals } = event;
	const { supabase, activeOrgId, org } = locals;
	if (!activeOrgId || !org) throw redirect(303, '/login');

	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'delete');

	const form = await superValidate(request, zod4(deleteRecordSchema), { id: DELETE_FORM_ID });
	if (!form.valid) return fail(400, { form });

	try {
		await removeRecord(supabase, activeOrgId, kind, form.data.id);
	} catch (cause) {
		return message(form, cause instanceof Error ? cause.message : 'Could not delete the record.', {
			status: 400
		});
	}

	return { form };
}

/** The one place a deletable kind becomes the crm module that removes its row. */
async function removeRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: DeletableListKind,
	id: string
): Promise<void> {
	switch (kind) {
		case 'company':
			return deleteCompany(supabase, orgId, id);
		case 'contact':
			return deleteContact(supabase, orgId, id);
		case 'deal':
			return deleteDeal(supabase, orgId, id);
		case 'product':
			return deleteProduct(supabase, orgId, id);
		case 'billable':
			return deleteBillable(supabase, orgId, id);
		case 'asset':
			return deleteAsset(supabase, orgId, id);
		case 'property':
			// A building's units go with it (`parent_id` cascades), which is the
			// depth cap earning its keep: there is no third level to orphan.
			return deleteProperty(supabase, orgId, id);
		case 'lease':
			return deleteLease(supabase, orgId, id);
		case 'proposal':
			return deleteProposal(supabase, orgId, id);
		case 'ticket':
			return deleteTicket(supabase, orgId, id);
		case 'coupon':
			return deleteCoupon(supabase, orgId, id);
		case 'order':
			return deleteOrder(supabase, orgId, id);
		// A shipment is deletable but not creatable or editable through the
		// generic form: `order_id` is not null and insert-only, so a box is
		// packed on the order it ships.
		case 'shipment':
			return deleteShipment(supabase, orgId, id);
		case 'purchase':
			return deletePurchase(supabase, orgId, id);
		case 'rma':
			return deleteRma(supabase, orgId, id);
		case 'visit':
			return deleteVisit(supabase, orgId, id);
	}
}

/**
 * The mirror of the switch below: one place a row becomes the strings the
 * form holds. Only the fields the form asks for — a column the registry does
 * not list is not the form's to carry back, let alone to write.
 *
 * An instant (a task's due date) goes out as the instant it is; turning it
 * into the wall clock a `datetime-local` shows is the browser's job, because
 * only the browser knows the zone (the calendar's rule, docs/calendar.md).
 */
async function recordFormValues(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: EditableRecordType,
	id: string
): Promise<Partial<RecordFormValues>> {
	switch (type) {
		case 'company': {
			const row = await getCompany(supabase, orgId, id);
			return row
				? {
						name: row.name,
						relationship: row.relationship,
						status: row.status,
						email: str(row.email),
						phone: str(row.phone),
						website: str(row.website)
					}
				: {};
		}
		case 'contact': {
			const row = await getContact(supabase, orgId, id);
			return row
				? {
						name: row.name,
						title: str(row.title),
						email: str(row.email),
						phone: str(row.phone),
						status: row.status
					}
				: {};
		}
		case 'deal': {
			const row = await getDeal(supabase, orgId, id);
			return row
				? {
						title: row.title,
						stage_id: row.stage_id,
						company_id: str(row.company_id),
						contact_id: str(row.contact_id),
						assigned_to: str(row.assigned_to),
						amount: str(row.amount),
						expected_close_date: str(row.expected_close_date)
					}
				: {};
		}
		case 'product': {
			const row = await getProduct(supabase, orgId, id);
			return row
				? {
						name: row.name,
						kind: row.kind,
						sku: str(row.sku),
						unit_price: str(row.unit_price),
						unit_cost: str(row.unit_cost),
						unit: str(row.unit),
						description: str(row.description)
					}
				: {};
		}
		case 'billable': {
			const row = await getBillable(supabase, orgId, id);
			return row
				? {
						name: row.name,
						code: str(row.code),
						unit_price: str(row.unit_price),
						unit: str(row.unit),
						unit_choices: (row.unit_choices ?? []).join(', '),
						is_featured: row.is_featured ? 'true' : 'false',
						description: str(row.description)
					}
				: {};
		}
		case 'asset': {
			const row = await getAsset(supabase, orgId, id);
			return row
				? {
						name: row.name,
						asset_type: str(row.asset_type),
						identifier: str(row.identifier),
						status: row.status,
						acquired_on: str(row.acquired_on),
						purchase_price: str(row.purchase_price),
						description: str(row.description)
					}
				: {};
		}
		case 'coupon': {
			const row = await getCoupon(supabase, orgId, id);
			return row
				? {
						code: row.code,
						discount_type: row.discount_type,
						discount_value: str(row.discount_value),
						starts_on: str(row.starts_on),
						ends_on: str(row.ends_on),
						is_active: row.is_active ? 'true' : 'false',
						description: str(row.description)
					}
				: {};
		}
		case 'property': {
			const row = await getProperty(supabase, orgId, id);
			return row
				? {
						name: row.name,
						parent_id: str(row.parent_id),
						property_type: str(row.property_type),
						identifier: str(row.identifier),
						status: row.status,
						bedrooms: str(row.bedrooms),
						bathrooms: str(row.bathrooms),
						square_feet: str(row.square_feet),
						market_rent: str(row.market_rent),
						acquired_on: str(row.acquired_on),
						purchase_price: str(row.purchase_price),
						description: str(row.description)
					}
				: {};
		}
		case 'order': {
			const row = await getOrder(supabase, orgId, id);
			return row
				? {
						company_id: row.company_id,
						contact_id: str(row.contact_id),
						customer_po: str(row.customer_po),
						estimated_ship_date: str(row.estimated_ship_date),
						shipping: str(row.shipping),
						discount: str(row.discount),
						notes: str(row.notes)
					}
				: {};
		}
		case 'purchase': {
			const row = await getPurchase(supabase, orgId, id);
			return row
				? {
						company_id: row.company_id,
						reference: str(row.reference),
						expected_at: str(row.expected_at),
						due_date: str(row.due_date),
						freight: str(row.freight),
						tax: str(row.tax),
						notes: str(row.notes)
					}
				: {};
		}
		case 'rma': {
			const row = await getRma(supabase, orgId, id);
			return row
				? {
						company_id: str(row.company_id),
						contact_id: str(row.contact_id),
						status: row.status,
						requested_on: str(row.requested_on),
						reason: str(row.reason),
						resolution: str(row.resolution)
					}
				: {};
		}
		case 'visit': {
			const row = await getVisit(supabase, orgId, id);
			return row
				? {
						subject: visitSubjectKey(row.entity_type, row.entity_id),
						status: row.status,
						outcome_id: str(row.outcome_id),
						scheduled_for: str(row.scheduled_for),
						occurred_at: str(row.occurred_at),
						ended_at: str(row.ended_at),
						location: formatFix(
							row.latitude === null || row.longitude === null
								? null
								: {
										latitude: row.latitude,
										longitude: row.longitude,
										accuracy: row.location_accuracy_m
									}
						),
						notes: str(row.notes)
					}
				: {};
		}
		case 'lease': {
			const row = await getLease(supabase, orgId, id);
			return row
				? {
						property_id: row.property_id,
						company_id: str(row.company_id),
						contact_id: str(row.contact_id),
						starts_on: row.starts_on,
						// Blank for a month-to-month tenancy, which is what a
						// null end date means.
						ends_on: str(row.ends_on),
						rent_amount: str(row.rent_amount),
						rent_due_day: str(row.rent_due_day),
						security_deposit: str(row.security_deposit),
						notes: str(row.notes)
					}
				: {};
		}
		case 'task': {
			const row = await getTask(supabase, orgId, id);
			return row
				? {
						title: row.title,
						priority: row.priority,
						company_id: str(row.company_id),
						contact_id: str(row.contact_id),
						due_at: str(row.due_at),
						details: str(row.details)
					}
				: {};
		}
		case 'ticket': {
			const row = await getTicket(supabase, orgId, id);
			return row
				? {
						subject: row.subject,
						priority: row.priority,
						company_id: str(row.company_id),
						contact_id: str(row.contact_id),
						assigned_to: str(row.assigned_to),
						description: str(row.description)
					}
				: {};
		}
	}
}

/**
 * The one place a record type becomes columns — for a create and for an edit
 * alike, because the mapping is the same one and two copies of it is how a
 * field starts saving on one path and not the other. Re-parsing with the
 * concrete schema is what narrows the form's strings back to the enum unions
 * the write wants — the generic form erased them, and a cast here would only
 * hide a mismatch between the schema and the table.
 *
 * `id` is what makes it an edit. A blank field means the same thing on both
 * paths: the column's empty value (null, or the zero a not-null money column
 * defaults to), never "leave it as it was" — otherwise clearing a field would
 * silently do nothing.
 */
/**
 * The one place a form's strings become a row — for every kind, creating and
 * editing alike. Answers with the record's id, which is what a writer that is
 * not a form needs: a create action redirects or refreshes a list, but
 * `insertRecord()` has to be able to say WHICH record it just made.
 */
async function writeRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType,
	values: RecordFormValues,
	id?: string
): Promise<string> {
	switch (type) {
		case 'company': {
			const data = companyRecordSchema.parse(values);
			const columns = {
				name: data.name,
				relationship: data.relationship,
				status: data.status,
				email: text(data.email),
				phone: text(data.phone),
				website: text(data.website)
			};
			const row = await (id
				? updateCompany(supabase, orgId, id, columns)
				: createCompany(supabase, orgId, columns));
			return row.id;
		}
		case 'contact': {
			const data = contactRecordSchema.parse(values);
			const columns = {
				name: data.name,
				title: text(data.title),
				email: text(data.email),
				phone: text(data.phone),
				status: data.status
			};
			const row = await (id
				? updateContact(supabase, orgId, id, columns)
				: createContact(supabase, orgId, columns));
			return row.id;
		}
		case 'deal': {
			const data = dealRecordSchema.parse(values);
			const columns = {
				title: data.title,
				// Who it is with, and whose it is: two different links, and a
				// deal may carry both, either or neither.
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				assigned_to: text(data.assigned_to),
				amount: amount(data.amount),
				expected_close_date: text(data.expected_close_date)
			};
			// The board and the stage move together or not at all. No stage
			// picked means the org's default board at its first stage on a
			// create (see crm/deals.ts), and on an edit it means the deal stays
			// where it is — a stage is the one field the form cannot clear,
			// because every deal is somewhere.
			const placement =
				data.stage_id === '' ? null : await dealPlacement(supabase, orgId, data.stage_id);
			if (id) {
				const row = await updateDeal(
					supabase,
					orgId,
					id,
					placement ? { ...columns, ...placement } : columns
				);
				return row.id;
			}
			const row = placement
				? await createDeal(supabase, orgId, { ...columns, ...placement })
				: await createDeal(supabase, orgId, columns);
			return row.id;
		}
		case 'product': {
			const data = productRecordSchema.parse(values);
			const columns = {
				name: data.name,
				kind: data.kind,
				sku: text(data.sku),
				unit_price: price(data.unit_price),
				unit_cost: amount(data.unit_cost),
				unit: text(data.unit),
				description: text(data.description)
			};
			const row = await (id
				? updateProduct(supabase, orgId, id, columns)
				: createProduct(supabase, orgId, columns));
			return row.id;
		}
		case 'billable': {
			const data = billableRecordSchema.parse(values);
			const columns = {
				name: data.name,
				code: text(data.code),
				unit_price: price(data.unit_price),
				unit: text(data.unit),
				unit_choices: list(data.unit_choices),
				is_featured: data.is_featured === 'true',
				description: text(data.description)
			};
			const row = await (id
				? updateBillable(supabase, orgId, id, columns)
				: createBillable(supabase, orgId, columns));
			return row.id;
		}
		case 'asset': {
			const data = assetRecordSchema.parse(values);
			const columns = {
				name: data.name,
				asset_type: text(data.asset_type),
				identifier: text(data.identifier),
				status: data.status,
				acquired_on: text(data.acquired_on),
				purchase_price: amount(data.purchase_price),
				description: text(data.description)
			};
			const row = await (id
				? updateAsset(supabase, orgId, id, columns)
				: createAsset(supabase, orgId, columns));
			return row.id;
		}
		case 'property': {
			const data = propertyRecordSchema.parse(values);
			// A blank parent is a building (or a single-family, which is its
			// own unit); a picked one makes this a unit inside it. The
			// database refuses a unit of a unit on either path, so neither
			// creating nor re-parenting can build a deeper tree.
			const columns = {
				name: data.name,
				parent_id: text(data.parent_id),
				property_type: text(data.property_type),
				identifier: text(data.identifier),
				status: data.status,
				bedrooms: integer(data.bedrooms),
				bathrooms: amount(data.bathrooms),
				square_feet: integer(data.square_feet),
				market_rent: amount(data.market_rent),
				acquired_on: text(data.acquired_on),
				purchase_price: amount(data.purchase_price),
				description: text(data.description)
			};
			const row = await (id
				? updateProperty(supabase, orgId, id, columns)
				: createProperty(supabase, orgId, columns));
			return row.id;
		}
		case 'lease': {
			const data = leaseRecordSchema.parse(values);
			// A blank end date is month-to-month, so it stays null rather than
			// being invented — and ending a lease early is moving this date,
			// not a status change, because there is no status column.
			const columns = {
				property_id: data.property_id,
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				starts_on: data.starts_on,
				ends_on: text(data.ends_on),
				rent_amount: Number(data.rent_amount),
				// Blank is the column's own default (the 1st), written out
				// rather than omitted: on an edit, leaving it out would mean
				// "as it was", and a blank field means the empty value on both
				// paths.
				rent_due_day: data.rent_due_day === '' ? 1 : Number(data.rent_due_day),
				security_deposit: amount(data.security_deposit),
				notes: text(data.notes)
			};
			const row = await (id
				? updateLease(supabase, orgId, id, columns)
				: createLease(supabase, orgId, columns));
			return row.id;
		}
		case 'invoice': {
			// Create only — an invoice is edited through its own lifecycle
			// actions on the record page, which is why it is not an
			// EditableRecordType.
			const data = invoiceRecordSchema.parse(values);
			// A draft: the number is the database's, the lines come next on the
			// invoice's own page, and nothing is owed until it is issued. Terms
			// left blank are the company's own, when there is one to ask.
			const company =
				data.company_id === '' ? null : await getCompany(supabase, orgId, data.company_id);
			const row = await createInvoice(supabase, orgId, {
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				payment_terms_days: integer(data.payment_terms_days) ?? company?.payment_terms_days ?? null,
				due_date: text(data.due_date),
				billing_email: text(data.billing_email),
				memo: text(data.memo)
			});
			return row.id;
		}
		case 'coupon': {
			const data = couponRecordSchema.parse(values);
			const columns = {
				code: data.code,
				discount_type: data.discount_type,
				// A not-null money column: blank is zero, the products rule.
				discount_value: price(data.discount_value),
				starts_on: text(data.starts_on),
				ends_on: text(data.ends_on),
				is_active: data.is_active === 'true',
				description: text(data.description)
			};
			const row = await (id
				? updateCoupon(supabase, orgId, id, columns)
				: createCoupon(supabase, orgId, columns));
			return row.id;
		}
		case 'order': {
			const data = orderRecordSchema.parse(values);
			const columns = {
				company_id: data.company_id,
				contact_id: text(data.contact_id),
				customer_po: text(data.customer_po),
				estimated_ship_date: text(data.estimated_ship_date),
				// Not-null money columns: blank is zero, the products rule.
				shipping: price(data.shipping),
				discount: price(data.discount),
				notes: text(data.notes)
			};
			const row = await (id
				? updateOrder(supabase, orgId, id, columns)
				: createOrder(supabase, orgId, columns));
			return row.id;
		}
		case 'purchase': {
			const data = purchaseRecordSchema.parse(values);
			const columns = {
				company_id: data.company_id,
				reference: text(data.reference),
				expected_at: instant(data.expected_at),
				due_date: text(data.due_date),
				// Not-null money columns: blank is zero, the products rule.
				freight: price(data.freight),
				tax: price(data.tax),
				notes: text(data.notes)
			};
			const row = await (id
				? updatePurchase(supabase, orgId, id, columns)
				: createPurchase(supabase, orgId, columns));
			return row.id;
		}
		case 'visit': {
			const data = visitRecordSchema.parse(values);
			// `<kind>:<id>` back into the entity link's two columns — the one
			// place that pair is split, as `RECORD_PICKER_KINDS` says.
			const [entityType, entityId] = splitVisitSubject(data.subject);
			const fix = parseFix(data.location);
			const columns = {
				entity_type: entityType,
				entity_id: entityId,
				status: data.status,
				scheduled_for: instant(data.scheduled_for),
				occurred_at: instant(data.occurred_at),
				ended_at: instant(data.ended_at),
				outcome_id: text(data.outcome_id),
				notes: text(data.notes),
				latitude: fix?.latitude ?? null,
				longitude: fix?.longitude ?? null,
				location_accuracy_m: fix?.accuracy ?? null
			};
			const row = await (id
				? updateVisit(supabase, orgId, id, columns)
				: createVisit(supabase, orgId, columns));
			return row.id;
		}
		case 'rma': {
			const data = rmaRecordSchema.parse(values);
			const columns = {
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				status: data.status,
				reason: text(data.reason),
				resolution: text(data.resolution)
			};
			// `requested_on` is not null with a default of today, so a blank
			// field means today rather than a null the column would refuse.
			const requested = data.requested_on === '' ? {} : { requested_on: data.requested_on };
			const row = await (id
				? updateRma(supabase, orgId, id, { ...columns, ...requested })
				: createRma(supabase, orgId, { ...columns, ...requested }));
			return row.id;
		}
		case 'task': {
			const data = taskRecordSchema.parse(values);
			// No assignee here: who is on a task is a relationship the task
			// modal and the assistant's assignTask write (docs/tasks.md). The
			// two ids below are who the task is FOR.
			const columns = {
				title: data.title,
				priority: data.priority,
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				due_at: instant(data.due_at),
				details: text(data.details)
			};
			const row = await (id
				? updateTask(supabase, orgId, id, columns)
				: createTask(supabase, orgId, columns));
			return row.id;
		}
		case 'ticket': {
			const data = ticketRecordSchema.parse(values);
			const columns = {
				subject: data.subject,
				priority: data.priority,
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				assigned_to: text(data.assigned_to),
				description: text(data.description)
			};
			const row = await (id
				? updateTicket(supabase, orgId, id, columns)
				: createTicket(supabase, orgId, columns));
			return row.id;
		}
	}
}

/** Blank is not a value: an untouched field becomes a null column. */
function text(value: string): string | null {
	return value === '' ? null : value;
}

/** A comma-separated list as typed, or null when nothing was: the units a billable offers as chips. */
function list(value: string): string[] | null {
	const items = value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : null;
}

/** A whole number as typed, or null when the field was left blank. */
function integer(value: string): number | null {
	return value === '' ? null : Number(value);
}

/**
 * A blank amount is no amount: null, for the money columns that allow it — a
 * deal with no figure yet, an asset nobody paid for. Explicit rather than
 * left out, because leaving it out of an UPDATE means "keep what was there",
 * and a field the writer cleared has to clear.
 */
function amount(value: string): number | null {
	return value === '' ? null : Number(value);
}

/**
 * The same, for a money column that is `not null default 0` (a product's or a
 * billable's price): blank is zero — which is what the default gave an insert
 * anyway, so nothing about creating changes.
 */
function price(value: string): number {
	return value === '' ? 0 : Number(value);
}

/** A column on its way back to the form: every field the form holds is a string. */
function str(value: string | number | null): string {
	return value === null ? '' : String(value);
}

/**
 * The instant a wall-clock pick names. The browser posts an ISO string with
 * its own offset; without JavaScript the naive `2026-09-10T17:00` arrives
 * instead and is read as UTC, which is the one thing the server can know.
 * Exported for the calendar's own forms, which post the same two shapes.
 */
export function instant(value: string): string | null {
	if (value === '') return null;
	const at = new Date(value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
	return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
