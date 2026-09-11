import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Database } from '$lib/database.types';
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
	type RecordFieldOption,
	type RecordFormValues,
	type RecordPickerKind,
	type RecordPickers,
	type RecordType
} from '$lib/schemas/records';
import { createAsset } from './crm/assets';
import { createBillable } from './crm/billables';
import { createCompany, getCompany, listCompanies } from './crm/companies';
import { createContact, listContacts } from './crm/contacts';
import { createDeal } from './crm/deals';
import { createInvoice } from './crm/invoices';
import { createProduct } from './crm/products';
import { createTask } from './crm/tasks';
import { createTicket } from './crm/tickets';
import { can, requirePermission } from './roles';

/**
 * The server half of the generic create form (`$lib/schemas/records.ts` is the
 * registry; `CreateRecord` is the component). Every list page's `+page.server.ts`
 * is the same two lines:
 *
 *   export const load = … ({ ...(await loadCreateRecord(locals, 'company')) })
 *   export const actions = { create: (event) => createRecord(event, 'company') };
 *
 * so one implementation validates, authorises and inserts for every kind of
 * record. The hook has already gated the route on the feature and the read
 * grant; creating needs `manage`, checked here and backed by RLS.
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
		await insertRecord(supabase, activeOrgId, type, form.data);
	} catch (cause) {
		// The crm modules throw the PostgREST message (see crm/unwrap.ts) — a
		// duplicate SKU or a policy refusal belongs in the form, not a 500.
		return message(form, cause instanceof Error ? cause.message : 'Could not create the record.', {
			status: 400
		});
	}

	return { form };
}

/**
 * The one place a record type becomes columns. Re-parsing with the concrete
 * schema is what narrows the form's strings back to the enum unions the
 * insert wants — the generic form erased them, and a cast here would only
 * hide a mismatch between the schema and the table.
 */
async function insertRecord(
	supabase: SupabaseClient<Database>,
	orgId: string,
	type: RecordType,
	values: RecordFormValues
): Promise<void> {
	switch (type) {
		case 'company': {
			const data = companyRecordSchema.parse(values);
			await createCompany(supabase, orgId, {
				name: data.name,
				relationship: data.relationship,
				status: data.status,
				email: text(data.email),
				phone: text(data.phone),
				website: text(data.website)
			});
			return;
		}
		case 'contact': {
			const data = contactRecordSchema.parse(values);
			await createContact(supabase, orgId, {
				name: data.name,
				title: text(data.title),
				email: text(data.email),
				phone: text(data.phone),
				status: data.status
			});
			return;
		}
		case 'deal': {
			const data = dealRecordSchema.parse(values);
			// No pipeline or stage: the deal lands in the org's default board at
			// its first stage (see crm/deals.ts).
			await createDeal(supabase, orgId, {
				title: data.title,
				amount: amount(data.amount),
				expected_close_date: text(data.expected_close_date)
			});
			return;
		}
		case 'product': {
			const data = productRecordSchema.parse(values);
			await createProduct(supabase, orgId, {
				name: data.name,
				kind: data.kind,
				sku: text(data.sku),
				unit_price: amount(data.unit_price),
				unit_cost: amount(data.unit_cost),
				unit: text(data.unit),
				description: text(data.description)
			});
			return;
		}
		case 'billable': {
			const data = billableRecordSchema.parse(values);
			await createBillable(supabase, orgId, {
				name: data.name,
				code: text(data.code),
				unit_price: amount(data.unit_price),
				unit: text(data.unit),
				unit_choices: list(data.unit_choices),
				is_featured: data.is_featured === 'true',
				description: text(data.description)
			});
			return;
		}
		case 'asset': {
			const data = assetRecordSchema.parse(values);
			await createAsset(supabase, orgId, {
				name: data.name,
				asset_type: text(data.asset_type),
				identifier: text(data.identifier),
				status: data.status,
				acquired_on: text(data.acquired_on),
				purchase_price: amount(data.purchase_price),
				description: text(data.description)
			});
			return;
		}
		case 'invoice': {
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
			await createTask(supabase, orgId, {
				title: data.title,
				priority: data.priority,
				due_at: instant(data.due_at),
				details: text(data.details)
			});
			return;
		}
		case 'ticket': {
			const data = ticketRecordSchema.parse(values);
			await createTicket(supabase, orgId, {
				subject: data.subject,
				priority: data.priority,
				description: text(data.description)
			});
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
 * A blank amount is left out of the insert entirely, so the column's own
 * default decides: null for a deal that has no figure yet, zero for a
 * product's price.
 */
function amount(value: string): number | undefined {
	return value === '' ? undefined : Number(value);
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
