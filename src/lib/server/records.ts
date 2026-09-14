import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Database } from '$lib/database.types';
import type { RecordKind } from '$lib/crm/records';
import {
	assetRecordSchema,
	billableRecordSchema,
	companyRecordSchema,
	contactRecordSchema,
	dealRecordSchema,
	invoiceRecordSchema,
	productRecordSchema,
	taskRecordSchema,
	ticketRecordSchema,
	RECORD_FORMS,
	RECORD_PICKER_KINDS,
	RECORD_SCHEMAS,
	RECORD_TYPES,
	type RecordFieldOption,
	type RecordFormValues,
	type RecordPickerKind,
	type RecordPickers,
	type RecordType
} from '$lib/schemas/records';
import { createAsset, getAsset, updateAsset } from './crm/assets';
import { createBillable, getBillable, updateBillable } from './crm/billables';
import { createCompany, getCompany, listCompanies, updateCompany } from './crm/companies';
import { createContact, getContact, listContacts, updateContact } from './crm/contacts';
import { createDeal, dealPlacement, getDeal, updateDeal } from './crm/deals';
import { createInvoice } from './crm/invoices';
import { listPipelines } from './crm/pipelines';
import { createProduct, getProduct, updateProduct } from './crm/products';
import { createTask, getTask, updateTask } from './crm/tasks';
import { createTicket, getTicket, updateTicket } from './crm/tickets';
import { can, requirePermission } from './roles';

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
async function loadPickers(
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

async function pickerOptions(
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
	return kind !== 'invoice' && RECORD_TYPES.some((type) => type === kind);
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
		case 'task': {
			const row = await getTask(supabase, orgId, id);
			return row
				? {
						title: row.title,
						priority: row.priority,
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
async function writeRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType,
	values: RecordFormValues,
	id?: string
): Promise<void> {
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
			await (id
				? updateCompany(supabase, orgId, id, columns)
				: createCompany(supabase, orgId, columns));
			return;
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
			await (id
				? updateContact(supabase, orgId, id, columns)
				: createContact(supabase, orgId, columns));
			return;
		}
		case 'deal': {
			const data = dealRecordSchema.parse(values);
			const columns = {
				title: data.title,
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
				await updateDeal(supabase, orgId, id, placement ? { ...columns, ...placement } : columns);
			} else if (placement) {
				await createDeal(supabase, orgId, { ...columns, ...placement });
			} else {
				await createDeal(supabase, orgId, columns);
			}
			return;
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
			await (id
				? updateProduct(supabase, orgId, id, columns)
				: createProduct(supabase, orgId, columns));
			return;
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
			await (id
				? updateBillable(supabase, orgId, id, columns)
				: createBillable(supabase, orgId, columns));
			return;
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
			await (id
				? updateAsset(supabase, orgId, id, columns)
				: createAsset(supabase, orgId, columns));
			return;
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
			await createInvoice(supabase, orgId, {
				company_id: text(data.company_id),
				contact_id: text(data.contact_id),
				payment_terms_days: integer(data.payment_terms_days) ?? company?.payment_terms_days ?? null,
				due_date: text(data.due_date),
				billing_email: text(data.billing_email),
				memo: text(data.memo)
			});
			return;
		}
		case 'task': {
			const data = taskRecordSchema.parse(values);
			const columns = {
				title: data.title,
				priority: data.priority,
				due_at: instant(data.due_at),
				details: text(data.details)
			};
			await (id ? updateTask(supabase, orgId, id, columns) : createTask(supabase, orgId, columns));
			return;
		}
		case 'ticket': {
			const data = ticketRecordSchema.parse(values);
			const columns = {
				subject: data.subject,
				priority: data.priority,
				description: text(data.description)
			};
			await (id
				? updateTicket(supabase, orgId, id, columns)
				: createTicket(supabase, orgId, columns));
			return;
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
