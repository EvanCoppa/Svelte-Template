import type { Enums } from '$lib/database.types';
import type { InvoiceWithParties } from '$lib/server/crm/invoices';
import type { PaymentWithParties } from '$lib/server/crm/payments';
import { recordHref, type RecordKind } from './records';
import { PAYMENT_METHOD_LABEL } from './tones';

/**
 * The ledger, as a fold over two tables — the client-safe half of
 * `$lib/server/crm/ledger`.
 *
 * A ledger row is an invoice that has been issued (or voided, which stays
 * in the record) or a payment that moved, read in date order; what a
 * customer owes is the signed sum of those rows. Nothing is stored for it
 * (the ledger migration's decision 2): the invoice's own `total` and
 * `balance_due` and the payment's `signed_amount` are the figures, and this
 * module only lines them up. Pure, so a test hands it rows and the ledger
 * page can fold a customer's slice again in the browser.
 *
 * "Today" is a wall-clock word — overdue, and the last thirty days — so it
 * is always an argument, never read here: the page passes the viewer's own
 * date, the way the task board buckets by the viewer's clock.
 */

/** Who an entry is on the account of — the company when one is named, else the person. */
export type LedgerCustomer = {
	kind: 'company' | 'contact';
	id: string;
	name: string;
	/** Null when the reader may not open that kind of record. */
	href: string | null;
};

/** The invoice a payment settles, when it settles one. */
export type LedgerInvoiceRef = { id: string; number: string; href: string | null };

type LedgerEntryBase = {
	/** `invoice:<id>` or `payment:<id>` — unique across both tables, for keyed rendering. */
	id: string;
	/** When it happened: the issue date of an invoice, the receipt of a payment. */
	at: string;
	currency: string;
	customer: LedgerCustomer;
	/** The entry's effect on what the customer owes: a charge is positive, money in negative. */
	delta: number;
};

export type LedgerEntry = LedgerEntryBase &
	(
		| {
				kind: 'invoice';
				invoiceId: string;
				number: string;
				href: string | null;
				status: 'issued' | 'void';
				paymentStatus: Enums<'payment_state'>;
				total: number;
				balanceDue: number;
				dueDate: string | null;
				memo: string | null;
		  }
		| {
				kind: 'payment';
				paymentId: string;
				direction: Enums<'payment_kind'>;
				method: string;
				reference: string | null;
				amount: number;
				appliedTo: LedgerInvoiceRef | null;
				notes: string | null;
		  }
	);

/** Whether the reader may open a record of that kind — the record page's own question. */
export type CanOpen = (kind: RecordKind) => boolean;

// ---------------------------------------------------------------------------
// Naming a customer
// ---------------------------------------------------------------------------

/**
 * One value for "which customer": `company:<id>` or `contact:<id>`. The
 * ledger's filter param and the payment form's picker both carry it, so a
 * company and a person share one control and one query string.
 */
export type CustomerKey = `company:${string}` | `contact:${string}`;

const CUSTOMER_KEY =
	/^(company|contact):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function customerKey(customer: { kind: 'company' | 'contact'; id: string }): CustomerKey {
	return `${customer.kind}:${customer.id}`;
}

/** The two columns a key names — one set, the other null — or null for anything that is not a key. */
export function parseCustomerKey(
	value: string | null | undefined
): { company_id: string | null; contact_id: string | null } | null {
	const match = value?.match(CUSTOMER_KEY);
	if (!match) return null;
	const [, kind, id] = match;
	return kind === 'company'
		? { company_id: id, contact_id: null }
		: { company_id: null, contact_id: id };
}

/**
 * Which side of a row is the account: the company when one is named, else
 * the person. A bill to a person at a company is on the company's account —
 * the person is who to talk to, not who owes — and a bill to a person alone
 * is on theirs. Decided here, once, for every surface: the ledger's rows,
 * the credit an invoice can draw on, and the check that money is never
 * moved between accounts. Null only for a row that names neither, which
 * the check constraint forbids.
 */
export function accountSideOf(row: {
	company_id: string | null;
	contact_id: string | null;
}): 'company' | 'contact' | null {
	if (row.company_id) return 'company';
	if (row.contact_id) return 'contact';
	return null;
}

/** The account a row sits on, as the key two rows can be compared by. */
export function accountKeyOf(row: {
	company_id: string | null;
	contact_id: string | null;
}): CustomerKey | null {
	const side = accountSideOf(row);
	if (side === 'company' && row.company_id) return customerKey({ kind: side, id: row.company_id });
	if (side === 'contact' && row.contact_id) return customerKey({ kind: side, id: row.contact_id });
	return null;
}

/** The account, named and linked, from a row read with its parties joined. */
function customerOf(
	row: Pick<InvoiceWithParties, 'company_id' | 'contact_id' | 'companies' | 'contacts'>,
	canOpen: CanOpen
): LedgerCustomer | null {
	const side = accountSideOf(row);
	const party = side === 'company' ? row.companies : side === 'contact' ? row.contacts : null;
	if (!side || !party) return null;
	return { kind: side, ...party, href: canOpen(side) ? recordHref(side, party.id) : null };
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

/**
 * Every ledger row from the invoices and payments given, newest first.
 * Drafts are left out — nothing is owed until an invoice is issued — and a
 * void invoice stays, with no effect on the balance, because a withdrawn
 * bill is still a thing that happened.
 */
export function describeLedger(
	invoices: readonly InvoiceWithParties[],
	payments: readonly PaymentWithParties[],
	canOpen: CanOpen
): LedgerEntry[] {
	const entries: LedgerEntry[] = [];
	const invoiceHref = (id: string) => (canOpen('invoice') ? recordHref('invoice', id) : null);

	for (const invoice of invoices) {
		if (invoice.status === 'draft') continue;
		const customer = customerOf(invoice, canOpen);
		if (!customer) continue;
		// Generated columns are typed nullable; a row that exists has them.
		const total = invoice.total ?? 0;
		entries.push({
			id: `invoice:${invoice.id}`,
			kind: 'invoice',
			at: invoice.issued_at ?? invoice.created_at,
			currency: invoice.currency,
			customer,
			delta: invoice.status === 'void' ? 0 : total,
			invoiceId: invoice.id,
			number: invoice.number,
			href: invoiceHref(invoice.id),
			status: invoice.status,
			paymentStatus: invoice.payment_status,
			total,
			balanceDue: invoice.status === 'void' ? 0 : (invoice.balance_due ?? 0),
			dueDate: invoice.due_date,
			memo: invoice.memo
		});
	}

	for (const payment of payments) {
		const customer = customerOf(payment, canOpen);
		if (!customer) continue;
		entries.push({
			id: `payment:${payment.id}`,
			kind: 'payment',
			at: payment.received_at,
			currency: payment.currency,
			customer,
			// A refund gives money back, so it puts the amount back on the account.
			delta: payment.kind === 'refund' ? payment.amount : -payment.amount,
			paymentId: payment.id,
			direction: payment.kind,
			method: PAYMENT_METHOD_LABEL[payment.method],
			reference: payment.reference,
			amount: payment.amount,
			appliedTo: payment.invoices && {
				id: payment.invoices.id,
				number: payment.invoices.number,
				href: invoiceHref(payment.invoices.id)
			},
			notes: payment.notes
		});
	}

	return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
}

export type LedgerEntryWithBalance = LedgerEntry & {
	/** What the customer owed after this entry — the account's running balance. */
	balance: number;
};

/**
 * A statement: the running balance after each entry, oldest to newest,
 * returned in the order given. Only meaningful for one customer's entries;
 * across the org the rows belong to different accounts and the sum means
 * nothing, so the page asks for it only when filtered to one.
 */
export function withRunningBalance(entries: readonly LedgerEntry[]): LedgerEntryWithBalance[] {
	const oldestFirst = [...entries].sort(
		(a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)
	);
	const balances = new Map<string, number>();
	let balance = 0;
	for (const entry of oldestFirst) {
		balance = round(balance + entry.delta);
		balances.set(entry.id, balance);
	}
	return entries.map((entry) => ({ ...entry, balance: balances.get(entry.id) ?? 0 }));
}

/** The four figures at the top of the ledger. */
export type LedgerSummary = {
	/** Issued and still owed, across every invoice. */
	outstanding: number;
	/** The part of `outstanding` whose due date has passed. */
	overdue: number;
	/** Money received and not applied to any invoice: credit on account. */
	unapplied: number;
	/** Net money in over the last thirty days, refunds subtracted. */
	collected: number;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sum the entries up as of `today` — the viewer's date, so "overdue" and
 * "the last thirty days" mean what they mean where the viewer sits.
 */
export function summarizeLedger(entries: readonly LedgerEntry[], today: Date): LedgerSummary {
	const cutoff = localDate(today);
	const since = today.getTime() - 30 * DAY;
	let outstanding = 0;
	let overdue = 0;
	let unapplied = 0;
	let collected = 0;
	for (const entry of entries) {
		if (entry.kind === 'invoice') {
			if (entry.status !== 'issued' || entry.balanceDue <= 0) continue;
			outstanding += entry.balanceDue;
			if (isOverdue(entry, cutoff)) overdue += entry.balanceDue;
		} else {
			if (entry.appliedTo === null) unapplied -= entry.delta;
			if (new Date(entry.at).getTime() >= since) collected -= entry.delta;
		}
	}
	return {
		outstanding: round(outstanding),
		overdue: round(overdue),
		unapplied: round(unapplied),
		collected: round(collected)
	};
}

/**
 * Past due and still owed — the aging query, asked of one entry. `today`
 * is a calendar date (`localDate()`), compared as the `date` column is:
 * by day, in no zone.
 */
export function isOverdue(entry: LedgerEntry, today: string): boolean {
	return (
		entry.kind === 'invoice' &&
		entry.status === 'issued' &&
		entry.balanceDue > 0 &&
		entry.dueDate !== null &&
		entry.dueDate < today
	);
}

/** A calendar date the way a `date` column spells it, in the given instant's local zone. */
export function localDate(at: Date): string {
	const month = String(at.getMonth() + 1).padStart(2, '0');
	const day = String(at.getDate()).padStart(2, '0');
	return `${String(at.getFullYear())}-${month}-${day}`;
}

/**
 * When an invoice issued on `day` (a calendar date — the viewer's, posted
 * with the issue form) falls due under its terms: net-30 is thirty days on;
 * no terms is no due date at all, which the ledger reads as "never overdue"
 * rather than "due today".
 */
export function dueDateFor(day: string, termsDays: number | null): string | null {
	if (termsDays === null) return null;
	const [year, month, date] = day.split('-').map(Number);
	const due = new Date(year, month - 1, date + termsDays);
	return localDate(due);
}

/** Money arithmetic in cents, so a running balance never drifts by a floating-point hair. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}
