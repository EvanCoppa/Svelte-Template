import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { customerKey, parseCustomerKey } from '$lib/crm/ledger';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import { readLedger, type LedgerFilter } from '$lib/server/crm/ledger';
import { deletePayment, receivedAtFor, recordPayment } from '$lib/server/crm/payments';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { accountPaymentSchema, paymentIdSchema } from '$lib/schemas/invoices';
import type { Actions, PageServerLoad } from './$types';

/**
 * The ledger — every charge and every payment on the org's books, newest
 * first, and the balances that fall out of them; filtered to one customer
 * (`?customer=company:<id>` / `contact:<id>`) it is that account's
 * statement, with a running balance. Gated by the hook on the `ledger`
 * feature + read grant; `manage` records money on account, `delete` takes a
 * payment off the books — the three levels, the way the staff page uses
 * them. Money against a particular invoice is recorded on that invoice's
 * page; here a payment lands on the customer's account, to be applied later.
 *
 * The rows are a read, not a table (the ledger migration's decision 2):
 * `readLedger()` folds the invoices and payments the reader may see, and the
 * page sums them by the viewer's own date.
 */

/** Explicit form ids, shared by the load, the actions and the page's two `superForm`s. */
const FORM_IDS = {
	payment: 'account-payment',
	removePayment: 'remove-payment'
} as const;

function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { orgId: activeOrgId, org };
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	const { supabase } = locals;
	const { orgId, org } = orgOf(locals);
	depends(QUERY.ledger);
	// The customer picker and the filter read both party lists.
	depends(QUERY.companies);
	depends(QUERY.contacts);

	// Whether an entry may link to its customer or its invoice: the same
	// decision the hook makes for those routes, so a link here is never a
	// link to a refusal.
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);

	// A filter naming no customer, or a malformed one, is the org-wide ledger.
	const customer = parseCustomerKey(url.searchParams.get('customer'));
	const filter: LedgerFilter = {};
	if (customer?.company_id) filter.companyId = customer.company_id;
	if (customer?.contact_id) filter.contactId = customer.contact_id;

	const [entries, companies, contacts, paymentForm, removePaymentForm] = await Promise.all([
		readLedger(supabase, orgId, filter, canOpen),
		listCompanies(supabase, orgId),
		// The accounts money can land on: every company, and the people who
		// stand alone. A person at a company pays on the company's account
		// (the ledger's rule), so they are not a second place to put it.
		listContacts(supabase, orgId, { unattachedOnly: true }),
		// The key is minted here and posted back, so a double submit collides
		// on the payments table instead of recording the same sum twice.
		superValidate({ idempotency_key: crypto.randomUUID() }, zod4(accountPaymentSchema), {
			id: FORM_IDS.payment,
			errors: false
		}),
		superValidate(zod4(paymentIdSchema), { id: FORM_IDS.removePayment })
	]);

	return {
		entries,
		/** The filter as applied — the key as the picker spells it, or blank for everyone. */
		customer: customer?.company_id
			? customerKey({ kind: 'company', id: customer.company_id })
			: customer?.contact_id
				? customerKey({ kind: 'contact', id: customer.contact_id })
				: '',
		customers: {
			companies: companies.map(({ id, name }) => ({ id, name })),
			contacts: contacts.map(({ id, name, email }) => ({ id, name, email }))
		},
		canRecord: can(access, 'ledger', 'manage'),
		canRemove: can(access, 'ledger', 'delete'),
		paymentForm,
		removePaymentForm
	};
};

export const actions: Actions = {
	recordPayment: async ({ request, locals }) => {
		const { orgId, org } = orgOf(locals);
		requirePermission(org.access, 'ledger', 'manage');
		const form = await superValidate(request, zod4(accountPaymentSchema), {
			id: FORM_IDS.payment
		});
		if (!form.valid) return fail(400, { form });

		// The schema's pattern already admitted it; the parse is what splits it.
		const customer = parseCustomerKey(form.data.customer);
		if (!customer) return message(form, 'Pick who the money came from.', { status: 400 });

		try {
			await recordPayment(locals.supabase, orgId, {
				...customer,
				invoice_id: null,
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

	removePayment: async ({ request, locals }) => {
		const { orgId, org } = orgOf(locals);
		requirePermission(org.access, 'ledger', 'delete');
		const form = await superValidate(request, zod4(paymentIdSchema), {
			id: FORM_IDS.removePayment
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deletePayment(locals.supabase, orgId, form.data.id);
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
