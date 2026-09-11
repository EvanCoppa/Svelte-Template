import { describe, expect, it } from 'vitest';
import {
	applyPayment,
	deletePayment,
	getPayment,
	listPayments,
	receivedAtFor,
	recordPayment
} from './payments';
import { ORG_ID, supabaseMock } from './test-support';

const PAYMENT_ID = 'e3000000-0000-0000-0000-000000000001';
const INVOICE_ID = 'e1000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const KEY = 'a0000000-0000-0000-0000-000000000001';

describe('payments data access', () => {
	it('lists the org’s payments with their customers and invoices, newest first', async () => {
		const rows = [{ id: PAYMENT_ID, amount: 250 }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listPayments(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('payments');
		expect(builder.select).toHaveBeenCalledWith(
			'*, companies(id, name), contacts(id, name), invoices(id, number)'
		);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledTimes(1);
		expect(builder.order).toHaveBeenCalledWith('received_at', { ascending: false });
		expect(builder.is).not.toHaveBeenCalled();
	});

	it('narrows to a customer and to money on account only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listPayments(supabase, ORG_ID, {
			companyId: COMPANY_ID,
			contactId: CONTACT_ID,
			unappliedOnly: true
		});
		expect(builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(builder.eq).toHaveBeenCalledWith('contact_id', CONTACT_ID);
		expect(builder.is).toHaveBeenCalledWith('invoice_id', null);
	});

	it('fetches one payment, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getPayment(supabase, ORG_ID, PAYMENT_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('records money in the org, on account when it settles no invoice', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: PAYMENT_ID } });

		await recordPayment(supabase, ORG_ID, {
			company_id: COMPANY_ID,
			contact_id: null,
			invoice_id: null,
			kind: 'payment',
			method: 'check',
			amount: 250,
			reference: '1042',
			received_at: '2026-09-10T12:00:00.000Z',
			idempotency_key: KEY,
			notes: null
		});
		expect(from).toHaveBeenCalledWith('payments');
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: null,
			invoice_id: null,
			kind: 'payment',
			method: 'check',
			amount: 250,
			reference: '1042',
			received_at: '2026-09-10T12:00:00.000Z',
			idempotency_key: KEY,
			notes: null,
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('applies a payment to an invoice, and takes it off one, scoped to org and id', async () => {
		const applied = supabaseMock({ data: { id: PAYMENT_ID } });
		await applyPayment(applied.supabase, ORG_ID, PAYMENT_ID, INVOICE_ID);
		expect(applied.builder.update).toHaveBeenCalledWith({ invoice_id: INVOICE_ID });
		expect(applied.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(applied.builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);
		expect(applied.builder.single).toHaveBeenCalled();

		const detached = supabaseMock({ data: { id: PAYMENT_ID } });
		await applyPayment(detached.supabase, ORG_ID, PAYMENT_ID, null);
		expect(detached.builder.update).toHaveBeenCalledWith({ invoice_id: null });
	});

	it('deletes scoped to org and id, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: PAYMENT_ID }] });
		await deletePayment(deleted.supabase, ORG_ID, PAYMENT_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', PAYMENT_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deletePayment(filtered.supabase, ORG_ID, PAYMENT_ID)).rejects.toThrow(
			'Payment was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listPayments(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});

describe('receivedAtFor', () => {
	it('leaves a blank day to the column’s default', () => {
		expect(receivedAtFor('')).toBeUndefined();
	});

	it('reads a picked day as noon UTC, so it lands on that date in every likely zone', () => {
		expect(receivedAtFor('2026-09-10')).toBe('2026-09-10T12:00:00.000Z');
	});
});
