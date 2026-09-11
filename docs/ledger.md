# The ledger: what every customer owes, and what they have paid

Every vertical this product serves bills someone and takes their money: a practice bills
a patient, a roofer bills a homeowner, a distributor bills an account. The **`invoices`**
feature is the documents — one bill to one customer, drafted from lines, issued, settled
or voided — and the **`ledger`** feature is the account those documents and the money
against them add up to: every charge and every payment, per customer and for the whole
organization, with the balance that falls out of them.

This page is the contract for keeping it that way. The `invoicing_and_payments` migration
built the tables; the `ledger` migration (`supabase/migrations/20260911140000_ledger.sql`)
made the customer a party and registered the two features. The app side is
`src/lib/server/crm/invoices.ts`, `payments.ts` and `ledger.ts`, the pure fold in
`src/lib/crm/ledger.ts`, and the forms in `src/lib/schemas/invoices.ts`.

## The tables

| table                | one row means                                                       | written by                          |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `invoices`           | one bill to one customer: status, terms, dates, the rolled-up money | members (delete: owner/admin)       |
| `invoice_line_items` | what is billed for, priced per line; `net_amount` is generated      | members, while the invoice is draft |
| `payments`           | one sum of money that moved, in or back out, on an invoice or not   | members (delete: owner/admin)       |

**There is no ledger table.** A ledger row is an issued invoice or a payment, read in date
order; what a customer owes is their signed sum. The invoice's own columns are already the
truth — `subtotal` and `tax` roll up from the lines, `amount_paid` and `payment_status`
from the payments, `total` and `balance_due` are generated — so a stored ledger would be a
second copy a trigger has to keep true. `readLedger()` reads the two tables and
`describeLedger()` folds them into `LedgerEntry`s; nothing materialises what a query can
answer.

## Rule 1 — a customer is a party

Both tables name a `company_id` and a `contact_id`, **both nullable, at least one set**
(the `invoices_has_customer` / `payments_has_customer` checks). A bill to a person at a
company names both; a bill to a patient or a homeowner names the person alone. That is
the party-model rule every other CRM table follows, and the ledger migration is where
invoices and payments caught up with it.

Which one is **the account** is decided once, in `accountSideOf()` in `$lib/crm/ledger.ts`:
the company when one is named, else the person. A payment from Lucius on Wayne's behalf
sits on Wayne's account, and the credit offered against Wayne's next invoice includes it;
a payment from Bruce, who has no company, sits on Bruce's. The `company:<id>` /
`contact:<id>` **customer key** (`customerKey()` / `accountKeyOf()` / `parseCustomerKey()`)
is how that choice travels — the ledger's filter param and the payment form's picker both
carry it, `readLedger()` keeps only the rows on that account (a contact filter would
otherwise pick up the bills that name the person at their company), and the ledger page's
"From" picker offers exactly the accounts money can land on: every company, and the
people who stand alone.

## Rule 2 — the document has a life, the money has a direction

An invoice's `status` is `draft` → `issued` → `void`, and each step is an act on the
record page, never an edit:

- **Draft.** Lines, terms and header can change. Nothing is owed; the ledger does not show
  it. Only a draft can be deleted (`deleteInvoice()` filters on it).
- **Issue.** Refused with no lines. Stamps `issued_at`, fills `due_date` from the terms
  when the draft set none (`dueDateFor()`), and closes the lines — the database trigger
  refuses any line write after this, and the page hides the buttons. Now it is on the
  ledger.
- **Void.** Withdrawn, kept in the record with `delta: 0`. Every payment applied to it
  falls back onto the account — the `invoices_void_detaches_payments` trigger does it in
  the same transaction as the status change, so the money still shows as received and
  sits there to be applied to the reissued bill, and a void can never be half-done.

A payment has a `kind` — `payment` or `refund` — and always a positive `amount`; the
direction is never smuggled into a sign a form could get wrong. On the ledger a payment
is `delta: -amount`, a refund `+amount`, and `signed_amount` in the database agrees.
`kind` is insert-only by grant: a wrong figure is a delete and a new row, so every invoice
it touched is restated by the rollup rather than rewritten in place.

## Rule 3 — overdue is a question, never a column

`balance_due > 0 and due_date < today` (the invoicing migration's decision 4). "Today" is
a wall-clock word, so nothing on the server decides it: `summarizeLedger(entries, today)`
and `isOverdue(entry, today)` take the date as an argument, and the pages pass the
viewer's own (`localDate(new Date())`), the way the task board buckets by the viewer's
clock. The list page's Payment column, the ledger's Status column and the four figures at
the top of the ledger are all computed in the browser from rows the server described.

## Two grants, one screen

The document is the `invoices` feature's and the money is the `ledger` feature's, so an
invoice's record page checks both:

| act                                                           | needs             |
| ------------------------------------------------------------- | ----------------- |
| open an invoice, see its lines and money                      | `invoices` read   |
| add a draft, edit lines and header, issue, void               | `invoices` manage |
| delete a draft                                                | `invoices` delete |
| record a payment on the invoice, apply on-account money to it | `ledger` manage   |
| record money on account (the ledger page)                     | `ledger` manage   |
| take a payment off the books                                  | `ledger` delete   |

Both derive from `proposals` in the role catalog — whoever a role lets quote may bill and
take payment at the same level — with the front desks that handle money listed explicitly
above the derivation (a dental Front Desk manages both). Access is app-level like tier
gating: RLS keeps the tables member-writable, and the checks live in the load and the
action.

## The screens

- **`/invoices`** — the list, with the money state as one word per row (`paid`, `partial`,
  `unpaid`, `overdue`). "Add invoice" is the generic record form: the first form to point
  a record at a party through the `company` / `contact` **picker field types**, whose
  options `loadCreateRecord()` reads per request. It creates a draft with a customer and
  terms (blank terms fall back to the company's own `payment_terms_days`); the lines come
  next.
- **`/invoices/<id>`** — the generic record page. `describeInvoice()` gives it the fields
  and pills; the **billing block** (`billing.server.ts` beside the page, drawn by
  `Detail.InvoiceLines` and `Detail.InvoicePayments`) is what an invoice has that no
  other kind does, rendered whenever the load supplies `data.billing` — a data-presence
  check like the task thread's. Every write on it is a superforms action on the page:
  `saveLine`, `removeLine`, `saveDetails`, `issue`, `void`, `remove`, `recordPayment`,
  `applyPayment`, `removePayment`. Applying is a click, so it posts a hidden form the way
  the calendar's drag does.
- **`/ledger`** — every entry newest first, four figures at the top (outstanding, overdue,
  credit on account, collected in the last thirty days), a customer filter in the query
  string (`?customer=company:<id>`), and, filtered to one account, a **running balance**
  column — the statement. "Record payment" here lands money on account, to be applied
  from an invoice later.
- **A company's or a contact's page** lists its invoices among its related records
  (`listRelatedRecords()`), each with its total and what is still owed.

## Every payment form carries an idempotency key

The load mints `crypto.randomUUID()` into the form; the action writes it to
`payments.idempotency_key`, which is unique per org. A double submit — a retried request,
a second click that got through — collides on that index instead of recording the same
check twice. A form that reopens after a save gets a fresh key with the reloaded data.

## What is deliberately not here

- **Statements and dunning.** The ledger page is the statement, read live. A PDF of it and
  a reminder on a schedule need a scheduler and document rendering the template lacks.
- **A payment across several invoices.** One row per invoice, sharing a `reference`.
  Splitting payments from allocations is the change to make when someone needs it.
- **Credit memos and write-offs.** A refund moves money; a write-off reduces what is owed
  without any moving, and is a document of its own — a sibling of `invoices`.
- **Tax calculation.** Lines carry a tax amount; deciding it needs rates and jurisdictions.
- **An assistant tool.** The data modules are ready for one (`listInvoices`,
  `readLedger`); it lands with the `ledger` feature's `ToolAccess` when it is written.
