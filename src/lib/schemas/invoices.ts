import { z } from 'zod';
import { PAYMENT_METHODS } from '$lib/crm/tones';

/**
 * The forms behind an invoice once it exists — its lines, its header, its
 * lifecycle — and the one that records money, on an invoice or on account.
 * The record page's billing block and the ledger page both post these, which
 * is why they live here rather than beside either route (the way the address
 * form does). Creating the draft itself is the generic record form
 * (`invoiceRecordSchema` in ./records).
 *
 * Money is typed as a string and parsed on the server, the generic form's
 * rule: what an `<input>` posts is text, and the action is the one place it
 * becomes a number. Ids are `z.guid()` for the reason the staff schema
 * gives: seeded fixture ids.
 */

const optionalText = z.string().trim().max(200, 'Must be 200 characters or fewer.').default('');

const optionalLongText = z
	.string()
	.trim()
	.max(2000, 'Must be 2000 characters or fewer.')
	.default('');

/** Money to the cent, as typed; blank means zero where a zero is legal. */
const optionalAmount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 120 or 120.50.')
	.default('');

/** A price or a quantity: up to four decimals, the precision the columns keep. */
const requiredFigure = (label: string) =>
	z
		.string()
		.trim()
		.regex(/^\d{1,10}(\.\d{1,4})?$/, `${label} must be a number like 1 or 2.5.`);

const optionalDate = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
	.default('');

const optionalEmail = z
	.string()
	.trim()
	.max(200, 'Must be 200 characters or fewer.')
	.refine((value) => value === '' || z.email().safeParse(value).success, {
		error: 'Enter a valid email address.'
	})
	.default('');

/**
 * One line, added or edited (`id` blank on add). `product_id` is the catalog
 * entry it was picked from — provenance only; the description and price are
 * the line's own once posted.
 */
export const invoiceLineSchema = z.object({
	id: z.guid().or(z.literal('')).default(''),
	product_id: z.guid().or(z.literal('')).default(''),
	description: z
		.string()
		.trim()
		.min(1, 'Say what the line is for.')
		.max(500, 'Must be 500 characters or fewer.'),
	quantity: requiredFigure('Quantity').refine((value) => Number(value) > 0, {
		error: 'Quantity must be more than zero.'
	}),
	unit_price: requiredFigure('Unit price'),
	discount: optionalAmount,
	tax: optionalAmount
});

export const removeInvoiceLineSchema = z.object({ id: z.guid() });

/** The header a human types on a draft; the money columns roll up from the lines. */
export const invoiceDetailsSchema = z.object({
	payment_terms_days: z
		.string()
		.trim()
		.regex(/^$|^\d{1,4}$/, 'Enter a whole number of days.')
		.default(''),
	due_date: optionalDate,
	billing_email: optionalEmail,
	shipping: optionalAmount,
	discount: optionalAmount,
	memo: optionalLongText,
	notes: optionalLongText
});

/**
 * Issue, void, delete: each posts the invoice's own id, so a form that
 * outlives a navigation cannot act on the record that replaced it — the
 * action checks it against the route.
 */
export const invoiceLifecycleSchema = z.object({ id: z.guid() });

/**
 * Issuing also posts the viewer's calendar date: the due date is counted
 * from the day the bill went out where the sender sits, not from the
 * server's clock — "today" is a wall-clock word. Blank without JavaScript,
 * and the server falls back to its own day.
 */
export const issueInvoiceSchema = invoiceLifecycleSchema.extend({ today: optionalDate });

export const PAYMENT_KINDS = ['payment', 'refund'] as const;

/**
 * Money that moved. `idempotency_key` is minted by the load and posted
 * back, so a double submit collides on the payments table's unique index
 * instead of recording the same check twice.
 */
export const paymentSchema = z.object({
	kind: z.enum(PAYMENT_KINDS).default('payment'),
	method: z.enum(PAYMENT_METHODS).default('check'),
	amount: z
		.string()
		.trim()
		.regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 250 or 250.00.')
		.refine((value) => Number(value) > 0, { error: 'The amount must be more than zero.' }),
	received_at: optionalDate,
	reference: optionalText,
	notes: optionalLongText,
	idempotency_key: z.guid()
});

/**
 * The ledger page's version: the same payment, plus who it came from — a
 * `company:<id>` or `contact:<id>` key from the customer picker
 * (`customerKey()` in `$lib/crm/ledger`).
 */
export const accountPaymentSchema = paymentSchema.extend({
	customer: z.string().regex(/^(company|contact):[0-9a-f-]{36}$/i, 'Pick who the money came from.')
});

/** Apply an on-account payment to the invoice on screen, or take one off the books. */
export const paymentIdSchema = z.object({ id: z.guid() });
