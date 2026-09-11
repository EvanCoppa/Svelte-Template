import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Infer } from 'sveltekit-superforms';
import { accountKeyOf, dueDateFor, localDate } from '$lib/crm/ledger';
import { recordKindForSegment, recordListHref, type RecordSegment } from '$lib/crm/records';
import type { Enums } from '$lib/database.types';
import { passesFeatureGate } from '$lib/features/gate';
import {
	addInvoiceLine,
	deleteInvoice,
	getInvoice,
	issueInvoice,
	removeInvoiceLine,
	updateInvoice,
	updateInvoiceLine,
	voidInvoice,
	type InvoiceLineItem,
	type InvoiceWithDetails
} from '$lib/server/crm/invoices';
import {
	applyPayment,
	deletePayment,
	getPayment,
	listPayments,
	receivedAtFor,
	recordPayment,
	type Payment
} from '$lib/server/crm/payments';
import { getProduct, listProducts } from '$lib/server/crm/products';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import {
	invoiceDetailsSchema,
	invoiceLifecycleSchema,
	invoiceLineSchema,
	issueInvoiceSchema,
	paymentIdSchema,
	paymentSchema,
	removeInvoiceLineSchema
} from '$lib/schemas/invoices';
import type { Actions } from './$types';

/**
 * The billing block of the record page — what an invoice has that no other
 * kind does: its lines, its money, and the two acts (issue, void) that move
 * it through its life. The generic page draws it whenever the load supplies
 * `data.billing`, a data-presence check like the task thread's, so the page
 * itself stays one renderer; this module keeps the block's reads and writes
 * together rather than doubling the page's own file.
 *
 * Two grants meet here. The document is the `invoices` feature's: `manage`
 * writes lines, header and lifecycle, `delete` removes a draft. The money is
 * the `ledger` feature's: `manage` records a payment against the invoice or
 * applies one the customer already has on account, `delete` takes one off
 * the books — so a clerk who bills but never handles cash, or the reverse,
 * is one role away.
 */

/** Explicit form ids, shared by the load, the actions and the block's `superForm`s. */
export const BILLING_FORM_IDS = {
	line: 'invoice-line',
	removeLine: 'remove-invoice-line',
	details: 'invoice-details',
	issue: 'issue-invoice',
	void: 'void-invoice',
	remove: 'remove-invoice',
	payment: 'invoice-payment',
	applyPayment: 'apply-payment',
	removePayment: 'remove-payment'
} as const;

/** A catalog entry the line form can start from — the price is a suggestion; the line keeps its own. */
export type BillingProduct = {
	id: string;
	name: string;
	sku: string | null;
	unit_price: number;
	unit: string | null;
};

export type BillingForms = {
	line: SuperValidated<Infer<typeof invoiceLineSchema>>;
	removeLine: SuperValidated<Infer<typeof removeInvoiceLineSchema>>;
	details: SuperValidated<Infer<typeof invoiceDetailsSchema>>;
	issue: SuperValidated<Infer<typeof issueInvoiceSchema>>;
	void: SuperValidated<Infer<typeof invoiceLifecycleSchema>>;
	remove: SuperValidated<Infer<typeof invoiceLifecycleSchema>>;
	payment: SuperValidated<Infer<typeof paymentSchema>>;
	applyPayment: SuperValidated<Infer<typeof paymentIdSchema>>;
	removePayment: SuperValidated<Infer<typeof paymentIdSchema>>;
};

/** Everything the billing block draws, from one invoice row. */
export type InvoiceBilling = {
	status: Enums<'invoice_status'>;
	currency: string;
	subtotal: number;
	tax: number;
	shipping: number;
	discount: number;
	total: number;
	amountPaid: number;
	balanceDue: number;
	dueDate: string | null;
	paymentTermsDays: number | null;
	billingEmail: string | null;
	memo: string | null;
	notes: string | null;
	lines: InvoiceLineItem[];
	/** The payments applied to this invoice, newest first. */
	payments: Payment[];
	/** The customer's money on account — recorded, applied to nothing — that could settle this one. */
	unapplied: Payment[];
	/** The catalog the line form offers, when there is one to offer. */
	products: BillingProduct[];
	forms: BillingForms;
	canManage: boolean;
	canDelete: boolean;
	canRecordPayments: boolean;
	canRemovePayments: boolean;
};

/**
 * The block's data for an invoice, or null when the record is not one. Reads
 * the invoice with its lines and payments — the same row `getRecord()`
 * described, read once more with everything on it — and, for a writer, the
 * two lists the forms draw from.
 */
export async function loadBilling(
	locals: App.Locals,
	params: { kind: RecordSegment; id: string }
): Promise<InvoiceBilling | null> {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	if (recordKindForSegment(params.kind) !== 'invoice') return null;

	const invoice = await getInvoice(supabase, activeOrgId, params.id);
	if (!invoice) return null;

	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canManage = can(access, 'invoices', 'manage');
	const canRecordPayments = can(access, 'ledger', 'manage');
	// The catalog is offered only when the writer may open it — the same
	// decision the hook makes for /products — and only while lines can change.
	const offersProducts =
		canManage &&
		invoice.status === 'draft' &&
		passesFeatureGate(recordListHref('product'), features, canRead);
	// Money on account is worth showing only where it could be applied.
	const seeksCredit = canRecordPayments && invoice.status === 'issued';

	const [products, unapplied, forms] = await Promise.all([
		offersProducts ? listProducts(supabase, activeOrgId, { activeOnly: true }) : [],
		seeksCredit ? listCredit(supabase, activeOrgId, invoice) : [],
		loadForms(invoice)
	]);

	return {
		status: invoice.status,
		currency: invoice.currency,
		subtotal: invoice.subtotal,
		tax: invoice.tax,
		shipping: invoice.shipping,
		discount: invoice.discount,
		total: invoice.total ?? 0,
		amountPaid: invoice.amount_paid,
		balanceDue: invoice.balance_due ?? 0,
		dueDate: invoice.due_date,
		paymentTermsDays: invoice.payment_terms_days,
		billingEmail: invoice.billing_email,
		memo: invoice.memo,
		notes: invoice.notes,
		lines: invoice.invoice_line_items,
		payments: invoice.payments,
		unapplied,
		products: products.map(({ id, name, sku, unit_price, unit }) => ({
			id,
			name,
			sku,
			unit_price,
			unit
		})),
		forms,
		canManage,
		canDelete: can(access, 'invoices', 'delete'),
		canRecordPayments,
		canRemovePayments: can(access, 'ledger', 'delete')
	};
}

/** The block's nine forms, the header one started from the row and the payment one from what is owed. */
async function loadForms(invoice: InvoiceWithDetails): Promise<BillingForms> {
	const lifecycle = { id: invoice.id };
	const [line, removeLine, details, issue, voidForm, remove, payment, apply, removePayment] =
		await Promise.all([
			superValidate(zod4(invoiceLineSchema), { id: BILLING_FORM_IDS.line }),
			superValidate(zod4(removeInvoiceLineSchema), { id: BILLING_FORM_IDS.removeLine }),
			superValidate(
				{
					payment_terms_days: figure(invoice.payment_terms_days),
					due_date: invoice.due_date ?? '',
					billing_email: invoice.billing_email ?? '',
					shipping: figure(invoice.shipping),
					discount: figure(invoice.discount),
					memo: invoice.memo ?? '',
					notes: invoice.notes ?? ''
				},
				zod4(invoiceDetailsSchema),
				{ id: BILLING_FORM_IDS.details, errors: false }
			),
			superValidate(lifecycle, zod4(issueInvoiceSchema), { id: BILLING_FORM_IDS.issue }),
			superValidate(lifecycle, zod4(invoiceLifecycleSchema), { id: BILLING_FORM_IDS.void }),
			superValidate(lifecycle, zod4(invoiceLifecycleSchema), { id: BILLING_FORM_IDS.remove }),
			// The key is minted here and posted back, so a double submit collides
			// on the payments table instead of recording the same sum twice.
			superValidate(
				{
					amount: figure(Math.max(invoice.balance_due ?? 0, 0)),
					idempotency_key: crypto.randomUUID()
				},
				zod4(paymentSchema),
				{ id: BILLING_FORM_IDS.payment, errors: false }
			),
			superValidate(zod4(paymentIdSchema), { id: BILLING_FORM_IDS.applyPayment }),
			superValidate(zod4(paymentIdSchema), { id: BILLING_FORM_IDS.removePayment })
		]);
	return {
		line,
		removeLine,
		details,
		issue,
		void: voidForm,
		remove,
		payment,
		applyPayment: apply,
		removePayment
	};
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

/** The org and the invoice this request writes, checked at the level the act needs. */
function invoiceOf(
	locals: App.Locals,
	params: { kind: RecordSegment; id: string },
	feature: 'invoices' | 'ledger',
	level: 'manage' | 'delete'
) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	if (recordKindForSegment(params.kind) !== 'invoice') {
		throw error(400, 'Only an invoice has lines and payments.');
	}
	requirePermission(org.access, feature, level);
	return { supabase, orgId: activeOrgId, invoiceId: params.id };
}

/** The invoice a lifecycle form names must be the one on screen — a stale form cannot act on a neighbour. */
function sameInvoice(postedId: string, invoiceId: string): boolean {
	return postedId === invoiceId;
}

/** The invoice on screen, or the 404 the page itself would give. */
async function invoiceRow(
	supabase: App.Locals['supabase'],
	orgId: string,
	invoiceId: string
): Promise<InvoiceWithDetails> {
	const invoice = await getInvoice(supabase, orgId, invoiceId);
	if (!invoice) throw error(404, 'Invoice not found.');
	return invoice;
}

/** The payments on the invoice's account that are applied to nothing yet. */
async function listCredit(
	supabase: App.Locals['supabase'],
	orgId: string,
	invoice: InvoiceWithDetails
): Promise<Payment[]> {
	const party = invoice.company_id
		? { companyId: invoice.company_id }
		: invoice.contact_id
			? { contactId: invoice.contact_id }
			: null;
	if (!party) return [];
	const payments = await listPayments(supabase, orgId, { ...party, unappliedOnly: true });
	// A person's payments made on a company's behalf sit on that company's
	// account, not the person's; the ledger's own rule says which.
	return payments.filter((payment) => accountKeyOf(payment) === accountKeyOf(invoice));
}

export const billingActions: Actions = {
	saveLine: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'manage');
		const form = await superValidate(request, zod4(invoiceLineSchema), {
			id: BILLING_FORM_IDS.line
		});
		if (!form.valid) return fail(400, { form });

		const { id, product_id, description, quantity, unit_price, discount, tax } = form.data;
		// The catalog entry is provenance: its SKU is snapshotted with the line,
		// and the read proves it is this org's before it is cited.
		const product = product_id === '' ? null : await getProduct(supabase, orgId, product_id);
		if (product_id !== '' && !product) {
			return message(form, 'That product is no longer in the catalog.', { status: 400 });
		}
		const values = {
			product_id: product?.id ?? null,
			product_sku_snapshot: product?.sku ?? null,
			description,
			quantity: Number(quantity),
			unit_price: Number(unit_price),
			discount: amount(discount),
			tax: amount(tax)
		};
		try {
			if (id === '') {
				// A new line goes last — after the highest order on the invoice,
				// since a removed line leaves a gap the count would refill.
				const invoice = await invoiceRow(supabase, orgId, invoiceId);
				await addInvoiceLine(supabase, orgId, invoiceId, {
					...values,
					sort_order: Math.max(-1, ...invoice.invoice_line_items.map((l) => l.sort_order)) + 1
				});
			} else {
				await updateInvoiceLine(supabase, orgId, invoiceId, id, values);
			}
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the line.', {
				status: 400
			});
		}
		return { form };
	},

	removeLine: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'manage');
		const form = await superValidate(request, zod4(removeInvoiceLineSchema), {
			id: BILLING_FORM_IDS.removeLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await removeInvoiceLine(supabase, orgId, invoiceId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove the line.', {
				status: 400
			});
		}
		return { form };
	},

	saveDetails: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'manage');
		const form = await superValidate(request, zod4(invoiceDetailsSchema), {
			id: BILLING_FORM_IDS.details
		});
		if (!form.valid) return fail(400, { form });

		const { payment_terms_days, due_date, billing_email, shipping, discount, memo, notes } =
			form.data;
		try {
			await updateInvoice(supabase, orgId, invoiceId, {
				payment_terms_days: payment_terms_days === '' ? null : Number(payment_terms_days),
				due_date: text(due_date),
				billing_email: text(billing_email),
				shipping: amount(shipping),
				discount: amount(discount),
				memo: text(memo),
				notes: text(notes)
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the invoice.', {
				status: 400
			});
		}
		return { form };
	},

	issue: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'manage');
		const form = await superValidate(request, zod4(issueInvoiceSchema), {
			id: BILLING_FORM_IDS.issue
		});
		if (!form.valid || !sameInvoice(form.data.id, invoiceId)) return fail(400, { form });

		const invoice = await invoiceRow(supabase, orgId, invoiceId);
		// A bill for nothing is not a bill.
		if (invoice.invoice_line_items.length === 0) {
			return message(form, 'Add at least one line before issuing.', { status: 400 });
		}
		try {
			// The date on the draft stands; otherwise the terms decide, counted
			// from the day it went out where the sender sits — the form posts
			// the viewer's date, and the server's own is the no-JS fallback.
			const issuedAt = new Date();
			const today = form.data.today === '' ? localDate(issuedAt) : form.data.today;
			await issueInvoice(supabase, orgId, invoiceId, {
				issuedAt: issuedAt.toISOString(),
				dueDate: invoice.due_date ?? dueDateFor(today, invoice.payment_terms_days)
			});
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not issue the invoice.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	void: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'manage');
		const form = await superValidate(request, zod4(invoiceLifecycleSchema), {
			id: BILLING_FORM_IDS.void
		});
		if (!form.valid || !sameInvoice(form.data.id, invoiceId)) return fail(400, { form });

		try {
			await voidInvoice(supabase, orgId, invoiceId, new Date().toISOString());
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not void the invoice.', {
				status: 400
			});
		}
		return { form };
	},

	remove: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'invoices', 'delete');
		const form = await superValidate(request, zod4(invoiceLifecycleSchema), {
			id: BILLING_FORM_IDS.remove
		});
		if (!form.valid || !sameInvoice(form.data.id, invoiceId)) return fail(400, { form });

		try {
			await deleteInvoice(supabase, orgId, invoiceId);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not delete the invoice.',
				{ status: 400 }
			);
		}
		// The record is gone; the list is the only place left to stand.
		throw redirect(303, recordListHref('invoice'));
	},

	recordPayment: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'ledger', 'manage');
		const form = await superValidate(request, zod4(paymentSchema), {
			id: BILLING_FORM_IDS.payment
		});
		if (!form.valid) return fail(400, { form });

		// The money is the invoice's customer's, whoever that is.
		const invoice = await invoiceRow(supabase, orgId, invoiceId);
		if (invoice.status !== 'issued') {
			return message(form, 'Only an issued invoice takes a payment.', { status: 400 });
		}
		try {
			await recordPayment(supabase, orgId, {
				company_id: invoice.company_id,
				contact_id: invoice.contact_id,
				invoice_id: invoiceId,
				kind: form.data.kind,
				method: form.data.method,
				amount: Number(form.data.amount),
				received_at: receivedAtFor(form.data.received_at),
				reference: text(form.data.reference),
				notes: text(form.data.notes),
				idempotency_key: form.data.idempotency_key
			});
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not record the payment.',
				{ status: 400 }
			);
		}
		return { form };
	},

	applyPayment: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'ledger', 'manage');
		const form = await superValidate(request, zod4(paymentIdSchema), {
			id: BILLING_FORM_IDS.applyPayment
		});
		if (!form.valid) return fail(400, { form });

		// On account, and this customer's: money is never moved between accounts here.
		const [invoice, payment] = await Promise.all([
			invoiceRow(supabase, orgId, invoiceId),
			getPayment(supabase, orgId, form.data.id)
		]);
		if (invoice.status !== 'issued') {
			return message(form, 'Only an issued invoice takes a payment.', { status: 400 });
		}
		if (
			!payment ||
			payment.invoice_id !== null ||
			accountKeyOf(payment) !== accountKeyOf(invoice)
		) {
			return message(form, 'That payment is not on this customer’s account.', { status: 400 });
		}
		try {
			await applyPayment(supabase, orgId, payment.id, invoiceId);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not apply the payment.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	removePayment: async ({ request, locals, params }) => {
		const { supabase, orgId, invoiceId } = invoiceOf(locals, params, 'ledger', 'delete');
		const form = await superValidate(request, zod4(paymentIdSchema), {
			id: BILLING_FORM_IDS.removePayment
		});
		if (!form.valid) return fail(400, { form });

		// Only a payment on this invoice comes off here; the ledger page is
		// where money on account is removed.
		const payment = await getPayment(supabase, orgId, form.data.id);
		if (!payment || payment.invoice_id !== invoiceId) {
			return message(form, 'That payment is not on this invoice.', { status: 400 });
		}
		try {
			await deletePayment(supabase, orgId, payment.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not remove the payment.',
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

/** A blank money field is zero: a line with no discount has a discount of nothing. */
function amount(value: string): number {
	return value === '' ? 0 : Number(value);
}

/** A column's figure as the form shows it — blank for null, otherwise as typed. */
function figure(value: number | null): string {
	return value === null ? '' : String(value);
}
