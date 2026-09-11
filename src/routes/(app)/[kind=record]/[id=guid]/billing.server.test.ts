import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { InvoiceLineItem, InvoiceWithDetails } from '$lib/server/crm/invoices';
import type { Payment } from '$lib/server/crm/payments';
import { ORG_ID, supabaseMockSequence } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { billingActions, loadBilling } from './billing.server';

/**
 * The record page's billing block from the outside: what it loads for whom,
 * and how the lines, the lifecycle and the money post — two grants meeting
 * on one record, refused before the database is touched.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['invoices', 'read' as const],
		['ledger', 'read' as const]
	])
};
/** Bills, never handles cash. */
const BILLER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['invoices', 'manage' as const]])
};
/** Handles cash, never bills. */
const CASHIER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['invoices', 'read' as const],
		['ledger', 'manage' as const]
	])
};

const INVOICE_ID = 'e1000000-0000-0000-0000-000000000001';
const LINE_ID = 'e2000000-0000-0000-0000-000000000001';
const PAYMENT_ID = 'e3000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '60000000-0000-0000-0000-000000000001';
const OTHER_INVOICE_ID = 'e1000000-0000-0000-0000-000000000099';
const KEY = 'a0000000-0000-0000-0000-000000000001';

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId`,
	// `org.access` and `org.features`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access, features: {} } } as never;
}

function lineRow(overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
	return {
		id: LINE_ID,
		org_id: ORG_ID,
		invoice_id: INVOICE_ID,
		product_id: null,
		product_sku_snapshot: null,
		description: 'Porcelain crown',
		quantity: 1,
		unit_price: 900,
		discount: 0,
		tax: 0,
		net_amount: 900,
		line_total: 900,
		sort_order: 0,
		created_at: '2026-08-30T12:00:00.000Z',
		updated_at: '2026-08-30T12:00:00.000Z',
		...overrides
	};
}

function paymentRow(overrides: Partial<Payment> = {}): Payment {
	return {
		id: PAYMENT_ID,
		org_id: ORG_ID,
		company_id: COMPANY_ID,
		contact_id: null,
		invoice_id: null,
		kind: 'payment',
		method: 'check',
		amount: 40,
		signed_amount: -40,
		currency: 'USD',
		reference: null,
		notes: null,
		received_at: '2026-09-05T12:00:00.000Z',
		idempotency_key: null,
		created_by: null,
		created_at: '2026-09-05T12:00:00.000Z',
		updated_at: '2026-09-05T12:00:00.000Z',
		...overrides
	};
}

function invoiceRow(overrides: Partial<InvoiceWithDetails> = {}): InvoiceWithDetails {
	return {
		id: INVOICE_ID,
		org_id: ORG_ID,
		number: 'INV-0001',
		status: 'issued',
		payment_status: 'unpaid',
		company_id: COMPANY_ID,
		contact_id: CONTACT_ID,
		order_id: null,
		currency: 'USD',
		subtotal: 900,
		tax: 0,
		shipping: 0,
		discount: 0,
		total: 900,
		amount_paid: 0,
		balance_due: 900,
		payment_terms_days: 30,
		due_date: '2026-10-01',
		issued_at: '2026-09-01T12:00:00.000Z',
		paid_at: null,
		voided_at: null,
		billing_email: null,
		memo: null,
		notes: null,
		created_by: null,
		created_at: '2026-08-30T12:00:00.000Z',
		updated_at: '2026-08-30T12:00:00.000Z',
		companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
		contacts: { id: CONTACT_ID, name: 'Lucius Fox' },
		invoice_line_items: [lineRow()],
		payments: [],
		...overrides
	};
}

function draftRow(overrides: Partial<InvoiceWithDetails> = {}): InvoiceWithDetails {
	return invoiceRow({
		status: 'draft',
		issued_at: null,
		due_date: null,
		balance_due: 0,
		...overrides
	});
}

function post(fields: [name: string, value: string][], id = INVOICE_ID) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request(`https://app.test/invoices/${id}`, { method: 'POST', body });
}

type ActionName = keyof typeof billingActions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][],
	kind = 'invoices'
) {
	// SAFETY: the actions read `request`, `locals` and `params` only.
	return billingActions[name]({
		request: post(fields),
		locals: localsFor(supabase, access),
		params: { kind, id: INVOICE_ID }
	} as never);
}

const newLine: [string, string][] = [
	['id', ''],
	['product_id', ''],
	['description', 'Whitening'],
	['quantity', '2'],
	['unit_price', '150'],
	['discount', ''],
	['tax', '']
];

const onInvoice: [string, string][] = [
	['kind', 'payment'],
	['method', 'card'],
	['amount', '900'],
	['received_at', '2026-09-10'],
	['reference', ''],
	['notes', 'Paid at the desk'],
	['idempotency_key', KEY]
];

describe('loadBilling', () => {
	it('is nothing for a record that is not an invoice, without a read', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(
			loadBilling(localsFor(supabase, OWNER), { kind: 'contacts', id: CONTACT_ID })
		).resolves.toBeNull();
		expect(from).not.toHaveBeenCalled();
	});

	it('is nothing for an invoice the reader cannot see', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: null }]);

		await expect(
			loadBilling(localsFor(supabase, OWNER), { kind: 'invoices', id: INVOICE_ID })
		).resolves.toBeNull();
		expect(from).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('invoices');
	});

	it('draws an issued invoice for a reader from one read, offering nothing to write with', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: invoiceRow() }]);

		const billing = await loadBilling(localsFor(supabase, READER), {
			kind: 'invoices',
			id: INVOICE_ID
		});
		if (!billing) throw new Error('expected the billing block');
		expect(from).toHaveBeenCalledTimes(1);
		expect(billing).toMatchObject({
			status: 'issued',
			currency: 'USD',
			subtotal: 900,
			total: 900,
			amountPaid: 0,
			balanceDue: 900,
			dueDate: '2026-10-01',
			paymentTermsDays: 30,
			unapplied: [],
			products: [],
			canManage: false,
			canDelete: false,
			canRecordPayments: false,
			canRemovePayments: false
		});
		expect(billing.lines).toEqual([lineRow()]);
		expect(billing.payments).toEqual([]);
		expect(Object.keys(billing.forms)).toEqual([
			'line',
			'removeLine',
			'details',
			'issue',
			'void',
			'remove',
			'payment',
			'applyPayment',
			'removePayment'
		]);
		// The day is the viewer's to fill in; blank until the page hydrates.
		expect(billing.forms.issue.data).toEqual({ id: INVOICE_ID, today: '' });
		expect(billing.forms.void.data).toEqual({ id: INVOICE_ID });
		expect(billing.forms.payment.data.amount).toBe('900');
		expect(billing.forms.payment.data.idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
		expect(billing.forms.details.data).toMatchObject({
			payment_terms_days: '30',
			due_date: '2026-10-01'
		});
	});

	it('finds the customer’s money on account for someone who may apply it to an issued invoice', async () => {
		const onAccount = paymentRow();
		const someoneElses = paymentRow({
			id: 'e3000000-0000-0000-0000-000000000002',
			company_id: null,
			contact_id: CONTACT_ID
		});
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: invoiceRow() },
			{ data: [onAccount, someoneElses] }
		]);

		const billing = await loadBilling(localsFor(supabase, CASHIER), {
			kind: 'invoices',
			id: INVOICE_ID
		});
		if (!billing) throw new Error('expected the billing block');
		expect(from).toHaveBeenNthCalledWith(2, 'payments');
		expect(builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(builder.is).toHaveBeenCalledWith('invoice_id', null);
		// The person's own money is not the company's, even on the company's bill.
		expect(billing.unapplied).toEqual([onAccount]);
		expect(billing.canRecordPayments).toBe(true);
		expect(billing.canManage).toBe(false);
	});

	it('offers the catalog to a writer on a draft, and no credit to apply', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: draftRow() },
			{
				data: [
					{
						id: PRODUCT_ID,
						name: 'Crown',
						sku: 'CROWN-01',
						unit_price: 900,
						unit: 'each',
						kind: 'good'
					}
				]
			}
		]);

		const billing = await loadBilling(localsFor(supabase, BILLER), {
			kind: 'invoices',
			id: INVOICE_ID
		});
		if (!billing) throw new Error('expected the billing block');
		expect(from).toHaveBeenCalledTimes(2);
		expect(from).toHaveBeenNthCalledWith(2, 'products');
		expect(builder.eq).toHaveBeenCalledWith('is_active', true);
		expect(billing.products).toEqual([
			{ id: PRODUCT_ID, name: 'Crown', sku: 'CROWN-01', unit_price: 900, unit: 'each' }
		]);
		expect(billing.unapplied).toEqual([]);
		expect(billing.canManage).toBe(true);
		expect(billing.canDelete).toBe(false);
		expect(billing.forms.payment.data.amount).toBe('0');
	});

	it('keeps the catalog off an issued invoice, whose lines are frozen', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: invoiceRow() }]);

		const billing = await loadBilling(localsFor(supabase, BILLER), {
			kind: 'invoices',
			id: INVOICE_ID
		});
		if (!billing) throw new Error('expected the billing block');
		expect(from).toHaveBeenCalledTimes(1);
		expect(billing.products).toEqual([]);
	});
});

describe('the line actions', () => {
	it('refuses a reader, and a record that is not an invoice, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('saveLine', supabase, READER, newLine)).rejects.toMatchObject({
			status: 403
		});
		await expect(run('saveLine', supabase, CASHIER, newLine)).rejects.toMatchObject({
			status: 403
		});
		await expect(run('saveLine', supabase, OWNER, newLine, 'contacts')).rejects.toMatchObject({
			status: 400,
			body: { message: 'Only an invoice has lines and payments.' }
		});
		await expect(run('removeLine', supabase, READER, [['id', LINE_ID]])).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('adds a line after the highest order — a removed line’s gap is not refilled — with no provenance when none was picked', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{
				data: invoiceRow({
					invoice_line_items: [lineRow(), lineRow({ id: 'other', sort_order: 2 })]
				})
			},
			{ data: lineRow() }
		]);

		const result = await run('saveLine', supabase, BILLER, newLine);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'invoices');
		expect(from).toHaveBeenNthCalledWith(2, 'invoice_line_items');
		expect(builder.insert).toHaveBeenCalledWith({
			product_id: null,
			product_sku_snapshot: null,
			description: 'Whitening',
			quantity: 2,
			unit_price: 150,
			discount: 0,
			tax: 0,
			sort_order: 3,
			org_id: ORG_ID,
			invoice_id: INVOICE_ID
		});
	});

	it('snapshots the catalog entry a line was picked from, and refuses one that is gone', async () => {
		const picked = supabaseMockSequence([
			{ data: { id: PRODUCT_ID, sku: 'WHITE-01' } },
			{ data: invoiceRow({ invoice_line_items: [] }) },
			{ data: lineRow() }
		]);
		const fromCatalog: [string, string][] = newLine.map(([name, value]) =>
			name === 'product_id' ? [name, PRODUCT_ID] : [name, value]
		);

		await run('saveLine', picked.supabase, BILLER, fromCatalog);
		expect(picked.from).toHaveBeenNthCalledWith(1, 'products');
		expect(picked.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				product_id: PRODUCT_ID,
				product_sku_snapshot: 'WHITE-01',
				sort_order: 0
			})
		);

		const gone = supabaseMockSequence([{ data: null }]);
		const result = await run('saveLine', gone.supabase, BILLER, fromCatalog);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'That product is no longer in the catalog.');
		expect(gone.builder.insert).not.toHaveBeenCalled();
	});

	it('edits the line the post names, on this invoice only, rather than adding another', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: lineRow() }]);

		const result = await run('saveLine', supabase, OWNER, [
			['id', LINE_ID],
			['description', 'Porcelain crown, upper right'],
			['quantity', '1'],
			['unit_price', '950'],
			['discount', '50'],
			['tax', '']
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('invoice_line_items');
		expect(builder.update).toHaveBeenCalledWith({
			product_id: null,
			product_sku_snapshot: null,
			description: 'Porcelain crown, upper right',
			quantity: 1,
			unit_price: 950,
			discount: 50,
			tax: 0
		});
		expect(builder.eq).toHaveBeenCalledWith('invoice_id', INVOICE_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', LINE_ID);
		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('echoes a bad line back inline', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('saveLine', supabase, BILLER, [
			['description', ''],
			['quantity', '0'],
			['unit_price', 'free']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.description', ['Say what the line is for.']);
		expect(result).toHaveProperty('data.form.errors.quantity', [
			'Quantity must be more than zero.'
		]);
		expect(result).toHaveProperty('data.form.errors.unit_price', [
			'Unit price must be a number like 1 or 2.5.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('hands the trigger’s refusal back inline when the line is frozen', async () => {
		const { supabase } = supabaseMockSequence([
			{ data: invoiceRow() },
			{ error: { message: 'Lines can only change on a draft.' } }
		]);

		const result = await run('saveLine', supabase, BILLER, newLine);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'Lines can only change on a draft.');
	});

	it('removes a line with evidence, and says so when nothing was removed', async () => {
		const removed = supabaseMockSequence([{ data: [{ id: LINE_ID }] }]);
		await expect(
			run('removeLine', removed.supabase, BILLER, [['id', LINE_ID]])
		).resolves.toHaveProperty('form.valid', true);
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.eq).toHaveBeenCalledWith('invoice_id', INVOICE_ID);
		expect(removed.builder.eq).toHaveBeenCalledWith('id', LINE_ID);

		const missing = supabaseMockSequence([{ data: [] }]);
		const result = await run('removeLine', missing.supabase, BILLER, [['id', LINE_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			expect.stringContaining('Line was not deleted')
		);
	});
});

describe('the header action', () => {
	it('saves the header a writer types, blank fields becoming null and blank money zero', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: invoiceRow() }]);

		const result = await run('saveDetails', supabase, BILLER, [
			['payment_terms_days', ''],
			['due_date', '2026-10-15'],
			['billing_email', 'ap@wayne.example'],
			['shipping', '25'],
			['discount', ''],
			['memo', ''],
			['notes', 'Net on receipt']
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledWith('invoices');
		expect(builder.update).toHaveBeenCalledWith({
			payment_terms_days: null,
			due_date: '2026-10-15',
			billing_email: 'ap@wayne.example',
			shipping: 25,
			discount: 0,
			memo: null,
			notes: 'Net on receipt'
		});
		expect(builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
	});

	it('refuses a reader, and a bad email, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(
			run('saveDetails', supabase, CASHIER, [['billing_email', 'ap@wayne.example']])
		).rejects.toMatchObject({ status: 403 });
		const result = await run('saveDetails', supabase, BILLER, [['billing_email', 'not-an-email']]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.billing_email', [
			'Enter a valid email address.'
		]);
		expect(from).not.toHaveBeenCalled();
	});
});

describe('the lifecycle actions', () => {
	it('refuses a reader, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('issue', supabase, READER, [['id', INVOICE_ID]])).rejects.toMatchObject({
			status: 403
		});
		await expect(run('void', supabase, CASHIER, [['id', INVOICE_ID]])).rejects.toMatchObject({
			status: 403
		});
		await expect(run('remove', supabase, BILLER, [['id', INVOICE_ID]])).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('refuses to issue a bill for nothing', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: draftRow({ invoice_line_items: [] }) }
		]);

		const result = await run('issue', supabase, BILLER, [['id', INVOICE_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'Add at least one line before issuing.');
		expect(from).toHaveBeenCalledTimes(1);
		expect(builder.update).not.toHaveBeenCalled();
	});

	it('issues a draft with lines, dating it now and due by its terms from the viewer’s day', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: draftRow() },
			{ data: invoiceRow() }
		]);

		const result = await run('issue', supabase, BILLER, [
			['id', INVOICE_ID],
			['today', '2026-09-11']
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(2, 'invoices');
		expect(builder.update).toHaveBeenCalledWith({
			status: 'issued',
			issued_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			due_date: '2026-10-11'
		});
		expect(builder.eq).toHaveBeenCalledWith('status', 'draft');
	});

	it('falls back to the server’s own day when the form posts none, and to no due date without terms', async () => {
		const dated = supabaseMockSequence([{ data: draftRow() }, { data: invoiceRow() }]);
		await run('issue', dated.supabase, BILLER, [['id', INVOICE_ID]]);
		expect(dated.builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ due_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
		);

		const open = supabaseMockSequence([
			{ data: draftRow({ payment_terms_days: null }) },
			{ data: invoiceRow() }
		]);
		await run('issue', open.supabase, BILLER, [
			['id', INVOICE_ID],
			['today', '2026-09-11']
		]);
		expect(open.builder.update).toHaveBeenCalledWith(expect.objectContaining({ due_date: null }));
	});

	it('refuses a day that is not a date, before reading the invoice', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('issue', supabase, BILLER, [
			['id', INVOICE_ID],
			['today', 'yesterday']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.today', ['Choose a date.']);
		expect(from).not.toHaveBeenCalled();
	});

	it('keeps the date already on the draft when issuing', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: draftRow({ due_date: '2026-12-24' }) },
			{ data: invoiceRow() }
		]);

		await run('issue', supabase, OWNER, [['id', INVOICE_ID]]);
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ due_date: '2026-12-24' })
		);
	});

	it('refuses a lifecycle form that names a neighbouring invoice', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		for (const name of ['issue', 'void', 'remove'] as const) {
			const result = await run(name, supabase, OWNER, [['id', OTHER_INVOICE_ID]]);
			expect(result).toMatchObject({ status: 400 });
		}
		expect(from).not.toHaveBeenCalled();
	});

	it('voids an issued invoice in one guarded write — the money goes back on account by trigger', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: invoiceRow({ status: 'void' }) }
		]);

		const result = await run('void', supabase, BILLER, [['id', INVOICE_ID]]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('invoices');
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'void', voided_at: expect.any(String) })
		);
		expect(builder.eq).toHaveBeenCalledWith('status', 'issued');
	});

	it('says so when there was no issued invoice to void', async () => {
		const { supabase } = supabaseMockSequence([
			{ error: { message: 'JSON object requested, multiple (or no) rows returned' } }
		]);

		const result = await run('void', supabase, OWNER, [['id', INVOICE_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('no) rows'));
	});

	it('deletes a draft and lands on the list, or says why it could not', async () => {
		const removed = supabaseMockSequence([{ data: [{ id: INVOICE_ID }] }]);
		await expect(
			run('remove', removed.supabase, OWNER, [['id', INVOICE_ID]])
		).rejects.toMatchObject({ status: 303, location: '/invoices' });
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.eq).toHaveBeenCalledWith('status', 'draft');

		const kept = supabaseMockSequence([{ data: [] }]);
		const result = await run('remove', kept.supabase, OWNER, [['id', INVOICE_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			expect.stringContaining('Invoice was not deleted')
		);
	});
});

describe('the money actions', () => {
	it('refuses someone who bills but does not handle cash, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('recordPayment', supabase, BILLER, onInvoice)).rejects.toMatchObject({
			status: 403
		});
		await expect(run('applyPayment', supabase, BILLER, [['id', PAYMENT_ID]])).rejects.toMatchObject(
			{ status: 403 }
		);
		await expect(
			run('removePayment', supabase, CASHIER, [['id', PAYMENT_ID]])
		).rejects.toMatchObject({ status: 403 });
		await expect(run('recordPayment', supabase, OWNER, onInvoice, 'deals')).rejects.toMatchObject({
			status: 400
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('records money against the invoice, for the invoice’s own customer', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: invoiceRow() },
			{ data: paymentRow({ invoice_id: INVOICE_ID }) }
		]);

		const result = await run('recordPayment', supabase, CASHIER, onInvoice);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'invoices');
		expect(from).toHaveBeenNthCalledWith(2, 'payments');
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: CONTACT_ID,
			invoice_id: INVOICE_ID,
			kind: 'payment',
			method: 'card',
			amount: 900,
			received_at: '2026-09-10T12:00:00.000Z',
			reference: null,
			notes: 'Paid at the desk',
			idempotency_key: KEY,
			org_id: ORG_ID
		});
	});

	it('takes no money against a draft', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: draftRow() }]);

		const result = await run('recordPayment', supabase, CASHIER, onInvoice);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'Only an issued invoice takes a payment.');
		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('echoes a bad payment back inline, before reading the invoice', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('recordPayment', supabase, CASHIER, [
			['amount', '0'],
			['idempotency_key', KEY]
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.amount', [
			'The amount must be more than zero.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('applies the customer’s money on account to the invoice', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: invoiceRow() },
			{ data: paymentRow() },
			{ data: paymentRow({ invoice_id: INVOICE_ID }) }
		]);

		const result = await run('applyPayment', supabase, CASHIER, [['id', PAYMENT_ID]]);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'invoices');
		expect(from).toHaveBeenNthCalledWith(2, 'payments');
		expect(from).toHaveBeenNthCalledWith(3, 'payments');
		expect(builder.update).toHaveBeenCalledWith({ invoice_id: INVOICE_ID });
		expect(builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);
	});

	it('never moves money between accounts, nor off another invoice', async () => {
		const someoneElses = supabaseMockSequence([
			{ data: invoiceRow() },
			{ data: paymentRow({ company_id: null, contact_id: CONTACT_ID }) }
		]);
		const result = await run('applyPayment', someoneElses.supabase, CASHIER, [['id', PAYMENT_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			'That payment is not on this customer’s account.'
		);
		expect(someoneElses.builder.update).not.toHaveBeenCalled();

		const applied = supabaseMockSequence([
			{ data: invoiceRow() },
			{ data: paymentRow({ invoice_id: OTHER_INVOICE_ID }) }
		]);
		await expect(
			run('applyPayment', applied.supabase, OWNER, [['id', PAYMENT_ID]])
		).resolves.toHaveProperty(
			'data.form.message',
			'That payment is not on this customer’s account.'
		);

		const missing = supabaseMockSequence([{ data: invoiceRow() }, { data: null }]);
		await expect(
			run('applyPayment', missing.supabase, OWNER, [['id', PAYMENT_ID]])
		).resolves.toHaveProperty(
			'data.form.message',
			'That payment is not on this customer’s account.'
		);
	});

	it('applies nothing to a draft', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: draftRow() },
			{ data: paymentRow() }
		]);

		const result = await run('applyPayment', supabase, CASHIER, [['id', PAYMENT_ID]]);
		expect(result).toHaveProperty('data.form.message', 'Only an issued invoice takes a payment.');
		expect(builder.update).not.toHaveBeenCalled();
	});

	it('takes a payment on this invoice off the books with evidence, and says so when nothing was removed', async () => {
		const removed = supabaseMockSequence([
			{ data: paymentRow({ invoice_id: INVOICE_ID }) },
			{ data: [{ id: PAYMENT_ID }] }
		]);
		await expect(
			run('removePayment', removed.supabase, OWNER, [['id', PAYMENT_ID]])
		).resolves.toHaveProperty('form.valid', true);
		expect(removed.from).toHaveBeenNthCalledWith(1, 'payments');
		expect(removed.builder.maybeSingle).toHaveBeenCalled();
		expect(removed.from).toHaveBeenNthCalledWith(2, 'payments');
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);

		const filtered = supabaseMockSequence([
			{ data: paymentRow({ invoice_id: INVOICE_ID }) },
			{ data: [] }
		]);
		const result = await run('removePayment', filtered.supabase, OWNER, [['id', PAYMENT_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			expect.stringContaining('Payment was not deleted')
		);
	});

	it('removes nothing that is not on this invoice: money on account, another bill’s, or nothing at all', async () => {
		for (const found of [paymentRow(), paymentRow({ invoice_id: OTHER_INVOICE_ID }), null]) {
			const { supabase, builder } = supabaseMockSequence([{ data: found }]);
			const result = await run('removePayment', supabase, OWNER, [['id', PAYMENT_ID]]);
			expect(result).toMatchObject({ status: 400 });
			expect(result).toHaveProperty('data.form.message', 'That payment is not on this invoice.');
			expect(builder.delete).not.toHaveBeenCalled();
		}
	});
});
