import { describe, expect, it } from 'vitest';
import type { InvoiceWithParties } from '$lib/server/crm/invoices';
import type { PaymentWithParties } from '$lib/server/crm/payments';
import {
	accountKeyOf,
	accountSideOf,
	customerKey,
	describeLedger,
	dueDateFor,
	isOverdue,
	localDate,
	parseCustomerKey,
	summarizeLedger,
	withRunningBalance,
	type LedgerEntry
} from './ledger';

/**
 * The fold behind the ledger page: which rows become entries, what each
 * does to the balance, and the four figures at the top — all asked of a
 * date the caller supplies, never of the clock.
 */

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const WAYNE = '20000000-0000-0000-0000-000000000001';
const LUCIUS = '30000000-0000-0000-0000-000000000001';
const BRUCE = '30000000-0000-0000-0000-000000000003';
const STAMPS = {
	created_at: '2026-08-01T09:00:00Z',
	updated_at: '2026-08-01T09:00:00Z',
	created_by: null
};

const openAll = () => true;
const openNone = () => false;

function invoice(overrides: Partial<InvoiceWithParties>): InvoiceWithParties {
	return {
		id: 'e5000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		company_id: WAYNE,
		contact_id: LUCIUS,
		order_id: null,
		number: 'INV-00001',
		status: 'issued',
		payment_status: 'partial',
		currency: 'USD',
		subtotal: 1800,
		tax: 148.5,
		shipping: 0,
		discount: 0,
		amount_paid: 1000,
		total: 1948.5,
		balance_due: 948.5,
		payment_terms_days: 30,
		due_date: '2026-09-01',
		issued_at: '2026-08-02T09:00:00Z',
		paid_at: null,
		voided_at: null,
		billing_email: null,
		memo: 'Site work, August.',
		notes: null,
		companies: { id: WAYNE, name: 'Wayne Enterprises' },
		contacts: { id: LUCIUS, name: 'Lucius Fox' },
		...STAMPS,
		...overrides
	};
}

function payment(overrides: Partial<PaymentWithParties>): PaymentWithParties {
	return {
		id: 'e7000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		company_id: WAYNE,
		contact_id: LUCIUS,
		invoice_id: 'e5000000-0000-0000-0000-000000000001',
		kind: 'payment',
		method: 'check',
		amount: 1000,
		currency: 'USD',
		reference: '4471',
		received_at: '2026-08-22T12:00:00Z',
		idempotency_key: null,
		notes: null,
		signed_amount: 1000,
		companies: { id: WAYNE, name: 'Wayne Enterprises' },
		contacts: { id: LUCIUS, name: 'Lucius Fox' },
		invoices: { id: 'e5000000-0000-0000-0000-000000000001', number: 'INV-00001' },
		...STAMPS,
		...overrides
	};
}

/** A bill to a person with no company: on their own account. */
const retainer = invoice({
	id: 'e5000000-0000-0000-0000-000000000003',
	number: 'INV-00003',
	company_id: null,
	contact_id: BRUCE,
	companies: null,
	contacts: { id: BRUCE, name: 'Bruce Wayne' },
	payment_status: 'unpaid',
	subtotal: 4000,
	tax: 0,
	amount_paid: 0,
	total: 4000,
	balance_due: 4000,
	due_date: '2026-09-29',
	issued_at: '2026-08-30T09:00:00Z',
	memo: null
});

const deposit = payment({
	id: 'e7000000-0000-0000-0000-000000000003',
	company_id: null,
	contact_id: BRUCE,
	invoice_id: null,
	method: 'cash',
	amount: 500,
	signed_amount: 500,
	reference: null,
	received_at: '2026-09-03T12:00:00Z',
	companies: null,
	contacts: { id: BRUCE, name: 'Bruce Wayne' },
	invoices: null
});

describe('customer keys', () => {
	it('names a company or a person as one value, and reads it back into the two columns', () => {
		expect(customerKey({ kind: 'company', id: WAYNE })).toBe(`company:${WAYNE}`);
		expect(parseCustomerKey(`company:${WAYNE}`)).toEqual({ company_id: WAYNE, contact_id: null });
		expect(parseCustomerKey(`contact:${BRUCE}`)).toEqual({ company_id: null, contact_id: BRUCE });
	});

	it('puts a row on the company’s account when one is named, else the person’s', () => {
		expect(accountSideOf({ company_id: WAYNE, contact_id: LUCIUS })).toBe('company');
		expect(accountKeyOf({ company_id: WAYNE, contact_id: LUCIUS })).toBe(`company:${WAYNE}`);
		expect(accountKeyOf({ company_id: null, contact_id: BRUCE })).toBe(`contact:${BRUCE}`);
		expect(accountKeyOf({ company_id: null, contact_id: null })).toBeNull();
	});

	it('reads anything that is not a key as nobody', () => {
		expect(parseCustomerKey(null)).toBeNull();
		expect(parseCustomerKey('')).toBeNull();
		expect(parseCustomerKey('company:not-an-id')).toBeNull();
		expect(parseCustomerKey(`deal:${WAYNE}`)).toBeNull();
	});
});

describe('describeLedger', () => {
	it('turns issued invoices and payments into entries, newest first, on the account they belong to', () => {
		const entries = describeLedger([invoice({}), retainer], [payment({}), deposit], openAll);

		expect(entries.map((entry) => entry.id)).toEqual([
			`payment:${deposit.id}`,
			`invoice:${retainer.id}`,
			`payment:${payment({}).id}`,
			`invoice:${invoice({}).id}`
		]);
		// A bill to a person at a company is on the company's account.
		expect(entries[3]).toMatchObject({
			kind: 'invoice',
			number: 'INV-00001',
			href: `/invoices/${invoice({}).id}`,
			customer: {
				kind: 'company',
				id: WAYNE,
				name: 'Wayne Enterprises',
				href: `/companies/${WAYNE}`
			},
			delta: 1948.5,
			balanceDue: 948.5,
			paymentStatus: 'partial',
			memo: 'Site work, August.'
		});
		// A bill to a person alone is on theirs.
		expect(entries[1].customer).toEqual({
			kind: 'contact',
			id: BRUCE,
			name: 'Bruce Wayne',
			href: `/contacts/${BRUCE}`
		});
		expect(entries[2]).toMatchObject({
			kind: 'payment',
			method: 'Check',
			reference: '4471',
			delta: -1000,
			appliedTo: { number: 'INV-00001', href: `/invoices/${invoice({}).id}` }
		});
		expect(entries[0]).toMatchObject({
			kind: 'payment',
			method: 'Cash',
			appliedTo: null,
			delta: -500
		});
	});

	it('leaves drafts out, keeps a void invoice with no effect, and puts a refund back on the account', () => {
		const draft = invoice({ id: 'd', number: 'INV-00005', status: 'draft', issued_at: null });
		const voided = invoice({
			id: 'v',
			number: 'INV-00004',
			status: 'void',
			voided_at: '2026-09-02T09:00:00Z'
		});
		const refund = payment({ id: 'r', kind: 'refund', amount: 200, signed_amount: -200 });

		const entries = describeLedger([draft, voided], [refund], openAll);
		expect(entries.map((entry) => entry.id)).toEqual(['payment:r', 'invoice:v']);
		expect(entries[1]).toMatchObject({ kind: 'invoice', status: 'void', delta: 0, balanceDue: 0 });
		expect(entries[0]).toMatchObject({ kind: 'payment', direction: 'refund', delta: 200 });
	});

	it('links nothing the reader may not open', () => {
		const [entry] = describeLedger([invoice({})], [payment({})], openNone);
		expect(entry.customer.href).toBeNull();
		expect(entry.kind === 'payment' && entry.appliedTo?.href).toBeNull();
	});
});

describe('withRunningBalance', () => {
	it('runs the balance oldest to newest and hands the rows back in the order given', () => {
		const entries = describeLedger([invoice({})], [payment({})], openAll);
		const statement = withRunningBalance(entries);

		expect(statement.map((row) => [row.id, row.balance])).toEqual([
			[`payment:${payment({}).id}`, 948.5],
			[`invoice:${invoice({}).id}`, 1948.5]
		]);
	});
});

describe('summarizeLedger', () => {
	const entries = describeLedger([invoice({}), retainer], [payment({}), deposit], openAll);

	it('sums what is owed, what is past due, the credit on account and the money in lately', () => {
		const summary = summarizeLedger(entries, new Date('2026-09-11T10:00:00'));
		expect(summary).toEqual({
			outstanding: 4948.5,
			overdue: 948.5,
			unapplied: 500,
			collected: 1500
		});
	});

	it('asks the date it is given, not the clock', () => {
		// Before INV-00001 fell due, and long after the check cleared.
		const early = summarizeLedger(entries, new Date('2026-08-25T10:00:00'));
		expect(early.overdue).toBe(0);
		const late = summarizeLedger(entries, new Date('2026-12-01T10:00:00'));
		expect(late.collected).toBe(0);
	});
});

describe('isOverdue', () => {
	const [charge] = describeLedger([invoice({})], [], openAll);
	if (charge.kind !== 'invoice') throw new Error('expected an invoice entry');

	it('is past due and still owed, by calendar day', () => {
		expect(isOverdue(charge, '2026-09-02')).toBe(true);
		expect(isOverdue(charge, '2026-09-01')).toBe(false);
	});

	it('is never a paid, void or undated invoice, or a payment', () => {
		const paid: LedgerEntry = { ...charge, balanceDue: 0 };
		const undated: LedgerEntry = { ...charge, dueDate: null };
		expect(isOverdue(paid, '2026-12-01')).toBe(false);
		expect(isOverdue(undated, '2026-12-01')).toBe(false);
		const [settled] = describeLedger([], [payment({})], openAll);
		expect(isOverdue(settled, '2026-12-01')).toBe(false);
	});
});

describe('dates', () => {
	it('spells a calendar day the way a date column does', () => {
		expect(localDate(new Date(2026, 8, 3))).toBe('2026-09-03');
	});

	it('falls due the terms after issue, or never without terms', () => {
		expect(dueDateFor('2026-09-11', 30)).toBe('2026-10-11');
		expect(dueDateFor('2026-09-11', 0)).toBe('2026-09-11');
		// Over a month end and a year end, by calendar arithmetic.
		expect(dueDateFor('2026-12-15', 30)).toBe('2027-01-14');
		expect(dueDateFor('2026-09-11', null)).toBeNull();
	});
});
