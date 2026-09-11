import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { InvoiceWithParties } from '$lib/server/crm/invoices';
import type { PaymentWithParties } from '$lib/server/crm/payments';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The ledger page from the outside: what the load folds and for whom, how
 * `?customer=` narrows it, and how a post from the on-account payment form
 * becomes a row — or a refusal, before the database is touched.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['ledger', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['ledger', 'manage' as const]])
};

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const INVOICE_ID = 'e1000000-0000-0000-0000-000000000001';
const PAYMENT_ID = 'e3000000-0000-0000-0000-000000000001';
const KEY = 'a0000000-0000-0000-0000-000000000001';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WAYNE = { id: COMPANY_ID, name: 'Wayne Enterprises' };

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId`,
	// `org.access` and `org.features`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access, features: {} } } as never;
}

function invoiceRow(): InvoiceWithParties {
	return {
		id: INVOICE_ID,
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
		contacts: null
	};
}

function paymentRow(): PaymentWithParties {
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
		invoices: null
	};
}

/** The four tables the load reads, each with one row to fold or to offer. */
function tables() {
	return supabaseTablesMock({
		invoices: { data: [invoiceRow()] },
		payments: { data: [paymentRow()] },
		companies: { data: [WAYNE] },
		contacts: { data: [{ id: CONTACT_ID, name: 'Lucius Fox', email: 'lucius@fox.example' }] }
	});
}

function loadWith(supabase: SupabaseClient<Database>, access: UserAccess, search = '') {
	// SAFETY: the load reads `locals`, `url.searchParams` and calls `depends`;
	// nothing else on the event.
	return load({
		locals: localsFor(supabase, access),
		url: new URL(`https://app.test/ledger${search}`),
		depends: vi.fn()
	} as never);
}

/** A plain form post, the way the page's forms post without JavaScript too. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/ledger', { method: 'POST', body });
}

type ActionName = keyof typeof actions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][]
) {
	// SAFETY: the actions read `request` and `locals` only.
	return actions[name]({ request: post(fields), locals: localsFor(supabase, access) } as never);
}

const onAccount: [string, string][] = [
	['customer', `company:${COMPANY_ID}`],
	['kind', 'payment'],
	['method', 'check'],
	['amount', '250'],
	['received_at', '2026-09-10'],
	['reference', '1042'],
	['notes', ''],
	['idempotency_key', KEY]
];

describe('the ledger load', () => {
	it('folds the org’s ledger, offers the accounts money can land on, and says what the reader may do', async () => {
		const { supabase, builders } = tables();

		const data = await loadWith(supabase, READER);
		if (!data) throw new Error('expected data');
		expect(data.entries).toMatchObject([
			{ id: `payment:${PAYMENT_ID}`, kind: 'payment' },
			{ id: `invoice:${INVOICE_ID}`, kind: 'invoice' }
		]);
		expect(data.customer).toBe('');
		expect(builders.invoices?.eq).toHaveBeenCalledTimes(1);
		expect(builders.payments?.eq).toHaveBeenCalledTimes(1);
		// The accounts money can land on: every company, and only the people
		// who stand alone — a person at a company pays on the company's account.
		expect(builders.contacts?.is).toHaveBeenCalledWith('company_id', null);
		expect(data.customers).toEqual({
			companies: [WAYNE],
			contacts: [{ id: CONTACT_ID, name: 'Lucius Fox', email: 'lucius@fox.example' }]
		});
		expect(data.canRecord).toBe(false);
		expect(data.canRemove).toBe(false);
		// The key is minted with the page so a double submit collides instead of doubling.
		expect(data.paymentForm.data.idempotency_key).toMatch(GUID);
	});

	it('narrows both lists to the customer the param names, and echoes the key back', async () => {
		const { supabase, builders } = tables();

		const data = await loadWith(supabase, OWNER, `?customer=company:${COMPANY_ID}`);
		if (!data) throw new Error('expected data');
		expect(data.customer).toBe(`company:${COMPANY_ID}`);
		expect(builders.invoices?.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(builders.payments?.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(data.canRecord).toBe(true);
		expect(data.canRemove).toBe(true);
	});

	it('narrows to a person the same way, spelling the key back as the picker does', async () => {
		const { supabase, builders } = tables();

		const data = await loadWith(supabase, MANAGER, `?customer=Contact:${CONTACT_ID}`);
		if (!data) throw new Error('expected data');
		expect(data.customer).toBe(`contact:${CONTACT_ID}`);
		expect(builders.invoices?.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);
		expect(builders.payments?.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);
		expect(data.canRecord).toBe(true);
		expect(data.canRemove).toBe(false);
	});

	it('ignores a malformed customer param and shows the whole org', async () => {
		const { supabase, builders } = tables();

		const data = await loadWith(supabase, READER, '?customer=company:not-a-guid');
		if (!data) throw new Error('expected data');
		expect(data.customer).toBe('');
		expect(builders.invoices?.eq).toHaveBeenCalledTimes(1);
		expect(builders.payments?.eq).toHaveBeenCalledTimes(1);
	});
});

describe('the ledger actions', () => {
	it('refuses a reader, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('recordPayment', supabase, READER, onAccount)).rejects.toMatchObject({
			status: 403
		});
		await expect(
			run('removePayment', supabase, MANAGER, [['id', PAYMENT_ID]])
		).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('records money on the customer’s account, applied to nothing', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: { id: PAYMENT_ID } }]);

		const result = await run('recordPayment', supabase, MANAGER, onAccount);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledWith('payments');
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: null,
			invoice_id: null,
			kind: 'payment',
			method: 'check',
			amount: 250,
			received_at: '2026-09-10T12:00:00.000Z',
			reference: '1042',
			notes: null,
			idempotency_key: KEY,
			org_id: ORG_ID
		});
	});

	it('puts a person’s payment on their own account', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: { id: PAYMENT_ID } }]);

		await run('recordPayment', supabase, OWNER, [
			['customer', `contact:${CONTACT_ID}`],
			['amount', '20'],
			['idempotency_key', KEY]
		]);
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ company_id: null, contact_id: CONTACT_ID, invoice_id: null })
		);
	});

	it('refuses a post naming no customer, inline, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('recordPayment', supabase, MANAGER, [
			['amount', '250'],
			['idempotency_key', KEY]
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.customer', ['Pick who the money came from.']);
		expect(from).not.toHaveBeenCalled();
	});

	it('refuses a post whose key is not a guid, so a double submit can always collide', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('recordPayment', supabase, MANAGER, [
			['customer', `company:${COMPANY_ID}`],
			['amount', '250'],
			['idempotency_key', 'once']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.idempotency_key');
		expect(from).not.toHaveBeenCalled();
	});

	it('hands the database’s refusal back inline', async () => {
		const { supabase } = supabaseMockSequence([{ error: { message: 'duplicate key' } }]);

		const result = await run('recordPayment', supabase, MANAGER, onAccount);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'duplicate key');
	});

	it('takes a payment off the books with evidence, and says so when nothing was removed', async () => {
		const removed = supabaseMockSequence([{ data: [{ id: PAYMENT_ID }] }]);
		await expect(
			run('removePayment', removed.supabase, OWNER, [['id', PAYMENT_ID]])
		).resolves.toHaveProperty('form.valid', true);
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);

		const missing = supabaseMockSequence([{ data: [] }]);
		const result = await run('removePayment', missing.supabase, OWNER, [['id', PAYMENT_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			expect.stringContaining('Payment was not deleted')
		);
	});
});
