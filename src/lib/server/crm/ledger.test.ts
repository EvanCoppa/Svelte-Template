import { describe, expect, it } from 'vitest';
import type { InvoiceWithParties } from './invoices';
import { readLedger } from './ledger';
import type { PaymentWithParties } from './payments';
import { ORG_ID, supabaseTablesMock } from './test-support';

/**
 * The ledger read from the outside: two indexed lists, one filter passed
 * to both, folded by the pure `describeLedger()` into the rows a statement
 * is made of. The fold's arithmetic is covered where it lives
 * (`$lib/crm/ledger.test.ts`); this pins the reads and that the fold is
 * the one applied.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const ISSUED_ID = 'e1000000-0000-0000-0000-000000000001';
const DRAFT_ID = 'e1000000-0000-0000-0000-000000000002';
const ALONE_ID = 'e1000000-0000-0000-0000-000000000003';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const PAYMENT_ID = 'e3000000-0000-0000-0000-000000000001';

const WAYNE = { id: COMPANY_ID, name: 'Wayne Enterprises' };

function invoiceRow(overrides: Partial<InvoiceWithParties> = {}): InvoiceWithParties {
	return {
		id: ISSUED_ID,
		org_id: ORG_ID,
		number: 'INV-0001',
		status: 'issued',
		payment_status: 'unpaid',
		company_id: COMPANY_ID,
		contact_id: null,
		order_id: null,
		currency: 'USD',
		subtotal: 100,
		tax: 0,
		shipping: 0,
		discount: 0,
		total: 100,
		amount_paid: 0,
		balance_due: 100,
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
		companies: WAYNE,
		contacts: null,
		...overrides
	};
}

function paymentRow(overrides: Partial<PaymentWithParties> = {}): PaymentWithParties {
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
		companies: WAYNE,
		contacts: null,
		invoices: null,
		...overrides
	};
}

describe('readLedger', () => {
	it('reads both tables with one filter and folds them into entries, newest first', async () => {
		const { supabase, from, builders } = supabaseTablesMock({
			invoices: {
				data: [
					invoiceRow(),
					invoiceRow({ id: DRAFT_ID, number: 'INV-0002', status: 'draft', issued_at: null })
				]
			},
			payments: { data: [paymentRow()] }
		});

		const entries = await readLedger(supabase, ORG_ID, { companyId: COMPANY_ID }, () => true);

		expect(from).toHaveBeenCalledWith('invoices');
		expect(from).toHaveBeenCalledWith('payments');
		expect(builders.invoices?.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builders.invoices?.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(builders.payments?.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builders.payments?.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);

		// The draft is nobody's debt yet, so it is not on the ledger.
		expect(entries.map((entry) => entry.id)).toEqual([
			`payment:${PAYMENT_ID}`,
			`invoice:${ISSUED_ID}`
		]);
		expect(entries[0]).toMatchObject({
			kind: 'payment',
			delta: -40,
			customer: { kind: 'company', id: COMPANY_ID, href: `/companies/${COMPANY_ID}` }
		});
		expect(entries[1]).toMatchObject({
			kind: 'invoice',
			delta: 100,
			balanceDue: 100,
			href: `/invoices/${ISSUED_ID}`
		});
	});

	it('keeps a person’s statement to their own account: a bill to them at a company is the company’s', async () => {
		const atCompany = invoiceRow({
			contact_id: CONTACT_ID,
			contacts: { id: CONTACT_ID, name: 'Lucius Fox' }
		});
		const alone = invoiceRow({
			id: ALONE_ID,
			number: 'INV-0003',
			company_id: null,
			companies: null,
			contact_id: CONTACT_ID,
			contacts: { id: CONTACT_ID, name: 'Lucius Fox' }
		});

		// The database filter matches both rows by contact_id; the fold's own
		// rule then drops the one that sits on the company's account.
		const byContact = supabaseTablesMock({
			invoices: { data: [atCompany, alone] },
			payments: { data: [] }
		});
		const statement = await readLedger(
			byContact.supabase,
			ORG_ID,
			{ contactId: CONTACT_ID },
			() => true
		);
		expect(byContact.builders.invoices?.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);
		expect(statement).toMatchObject([
			{ id: `invoice:${ALONE_ID}`, customer: { kind: 'contact', id: CONTACT_ID } }
		]);

		const byCompany = supabaseTablesMock({
			invoices: { data: [atCompany] },
			payments: { data: [] }
		});
		const account = await readLedger(
			byCompany.supabase,
			ORG_ID,
			{ companyId: COMPANY_ID },
			() => true
		);
		expect(account).toMatchObject([
			{ id: `invoice:${ISSUED_ID}`, customer: { kind: 'company', id: COMPANY_ID } }
		]);
	});

	it('reads the whole org when the filter names nobody, and keeps links off what the reader may not open', async () => {
		const { supabase, builders } = supabaseTablesMock({
			invoices: { data: [invoiceRow()] },
			payments: { data: [] }
		});

		const entries = await readLedger(supabase, ORG_ID, {}, () => false);

		expect(builders.invoices?.eq).toHaveBeenCalledTimes(1);
		expect(builders.payments?.eq).toHaveBeenCalledTimes(1);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ href: null, customer: { href: null } });
	});

	it('throws the PostgREST message when either read fails', async () => {
		const { supabase } = supabaseTablesMock({
			invoices: { data: [] },
			payments: { error: { message: 'boom' } }
		});

		await expect(readLedger(supabase, ORG_ID, {}, () => true)).rejects.toThrow('boom');
	});
});
