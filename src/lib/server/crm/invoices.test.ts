import { describe, expect, it } from 'vitest';
import {
	addInvoiceLine,
	createInvoice,
	deleteInvoice,
	getInvoice,
	issueInvoice,
	listInvoices,
	removeInvoiceLine,
	updateInvoice,
	updateInvoiceLine,
	voidInvoice
} from './invoices';
import { ORG_ID, supabaseMock } from './test-support';

const INVOICE_ID = 'e1000000-0000-0000-0000-000000000001';
const LINE_ID = 'e2000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '60000000-0000-0000-0000-000000000001';

const PARTIES = 'companies(id, name), contacts(id, name)';

describe('invoices data access', () => {
	it('lists the org’s invoices with their customers, newest first', async () => {
		const rows = [{ id: INVOICE_ID, number: 'INV-0001' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listInvoices(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('invoices');
		expect(builder.select).toHaveBeenCalledWith(`*, ${PARTIES}`);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledTimes(1);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});

	it('narrows to a customer, by company or by person, only when asked', async () => {
		const byCompany = supabaseMock({ data: [] });
		await listInvoices(byCompany.supabase, ORG_ID, { companyId: COMPANY_ID });
		expect(byCompany.builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(byCompany.builder.eq).not.toHaveBeenCalledWith('contact_id', expect.anything());

		const byContact = supabaseMock({ data: [] });
		await listInvoices(byContact.supabase, ORG_ID, { contactId: CONTACT_ID });
		expect(byContact.builder.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);
		expect(byContact.builder.eq).not.toHaveBeenCalledWith('company_id', expect.anything());
	});

	it('asks the aging question as issued and still owed', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listInvoices(supabase, ORG_ID, { outstandingOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('status', 'issued');
		expect(builder.gt).toHaveBeenCalledWith('balance_due', 0);

		const bare = supabaseMock({ data: [] });
		await listInvoices(bare.supabase, ORG_ID);
		expect(bare.builder.gt).not.toHaveBeenCalled();
	});

	it('fetches one invoice with its lines and payments in order, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getInvoice(supabase, ORG_ID, INVOICE_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith(
			`*, ${PARTIES}, invoice_line_items(*), payments(*)`
		);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'invoice_line_items'
		});
		expect(builder.order).toHaveBeenCalledWith('received_at', {
			referencedTable: 'payments',
			ascending: false
		});
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a draft in the org and leaves the number to the database', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: INVOICE_ID } });

		await createInvoice(supabase, ORG_ID, {
			company_id: COMPANY_ID,
			contact_id: null,
			payment_terms_days: 30,
			memo: 'September retainer'
		});
		expect(from).toHaveBeenCalledWith('invoices');
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: null,
			payment_terms_days: 30,
			memo: 'September retainer',
			org_id: ORG_ID
		});
		expect(builder.insert).not.toHaveBeenCalledWith(
			expect.objectContaining({ number: expect.anything() })
		);
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates the header scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: INVOICE_ID } });

		await updateInvoice(supabase, ORG_ID, INVOICE_ID, { billing_email: 'ap@wayne.example' });
		expect(builder.update).toHaveBeenCalledWith({ billing_email: 'ap@wayne.example' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
		expect(builder.single).toHaveBeenCalled();
	});

	it('issues a draft only — dating it, and refusing to re-date an issued bill', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: INVOICE_ID } });

		await issueInvoice(supabase, ORG_ID, INVOICE_ID, {
			issuedAt: '2026-09-11T09:00:00.000Z',
			dueDate: '2026-10-11'
		});
		expect(builder.update).toHaveBeenCalledWith({
			status: 'issued',
			issued_at: '2026-09-11T09:00:00.000Z',
			due_date: '2026-10-11'
		});
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
		expect(builder.eq).toHaveBeenCalledWith('status', 'draft');
	});

	it('voids an issued invoice only — one guarded update, the payments detached by the database', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: INVOICE_ID, status: 'void' } });

		await voidInvoice(supabase, ORG_ID, INVOICE_ID, '2026-09-11T09:00:00.000Z');
		expect(from).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('invoices');
		expect(builder.update).toHaveBeenCalledWith({
			status: 'void',
			voided_at: '2026-09-11T09:00:00.000Z'
		});
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
		expect(builder.eq).toHaveBeenCalledWith('status', 'issued');
		expect(builder.eq).toHaveBeenCalledTimes(3);
		expect(builder.single).toHaveBeenCalled();
	});

	it('deletes a draft only, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: INVOICE_ID }] });
		await deleteInvoice(deleted.supabase, ORG_ID, INVOICE_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', INVOICE_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('status', 'draft');
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteInvoice(filtered.supabase, ORG_ID, INVOICE_ID)).rejects.toThrow(
			'Invoice was not deleted'
		);
	});

	it('adds a line to the invoice in the org', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: LINE_ID } });

		await addInvoiceLine(supabase, ORG_ID, INVOICE_ID, {
			product_id: PRODUCT_ID,
			product_sku_snapshot: 'CROWN-01',
			description: 'Porcelain crown',
			quantity: 1,
			unit_price: 900,
			discount: 0,
			tax: 0,
			sort_order: 2
		});
		expect(from).toHaveBeenCalledWith('invoice_line_items');
		expect(builder.insert).toHaveBeenCalledWith({
			product_id: PRODUCT_ID,
			product_sku_snapshot: 'CROWN-01',
			description: 'Porcelain crown',
			quantity: 1,
			unit_price: 900,
			discount: 0,
			tax: 0,
			sort_order: 2,
			org_id: ORG_ID,
			invoice_id: INVOICE_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates a line scoped to org, invoice and id', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: LINE_ID } });

		await updateInvoiceLine(supabase, ORG_ID, INVOICE_ID, LINE_ID, {
			quantity: 2,
			unit_price: 850
		});
		expect(from).toHaveBeenCalledWith('invoice_line_items');
		expect(builder.update).toHaveBeenCalledWith({ quantity: 2, unit_price: 850 });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('invoice_id', INVOICE_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', LINE_ID);
	});

	it('removes a line scoped to its invoice, with evidence, throwing on zero rows', async () => {
		const removed = supabaseMock({ data: [{ id: LINE_ID }] });
		await removeInvoiceLine(removed.supabase, ORG_ID, INVOICE_ID, LINE_ID);
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(removed.builder.eq).toHaveBeenCalledWith('invoice_id', INVOICE_ID);
		expect(removed.builder.eq).toHaveBeenCalledWith('id', LINE_ID);
		expect(removed.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(removeInvoiceLine(filtered.supabase, ORG_ID, INVOICE_ID, LINE_ID)).rejects.toThrow(
			'Line was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listInvoices(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});
