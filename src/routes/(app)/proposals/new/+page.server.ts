import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { recordHref, recordListHref, recordTerms, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import { listDeals } from '$lib/server/crm/deals';
import { listProducts } from '$lib/server/crm/products';
import { createProposalWithOptions, type ProposalOptionInsert } from '$lib/server/crm/proposals';
import { hasGrant, requirePermission } from '$lib/server/roles';
import { emptyOption, proposalBuilderSchema, type ProposalBuilder } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The proposal builder — the one screen that creates a proposal, and the
 * reason `proposal` is not a kind the generic record form knows: a proposal
 * is born with its options, laid out side by side the way the grid will show
 * them, each priced from the catalog. That is a page, not a modal (the
 * staff page's invite is the other form that keeps its own for a reason).
 *
 * Sitting under `/proposals` gates it on the feature and the read grant;
 * creating needs `manage`, checked here and backed by RLS. What the page is
 * called — "New quote", "New treatment plan" — is the feature's word as the
 * org's industry says it, so the load titles it (the record-title exception
 * in the pages migration) and nothing here names it.
 */

/** A record the picker offers as the proposal's parent. */
export type PartyOption = { id: string; name: string; detail: string | null };

/**
 * A catalog row as the option editor offers it: a line is priced from
 * `unit_price` (what the client pays), never `unit_cost` (what it costs the org).
 */
export type CatalogProduct = {
	id: string;
	name: string;
	kind: 'good' | 'service';
	unit_price: number;
	currency: string;
};

function contextFor(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	return {
		orgId: activeOrgId,
		access: org.access,
		canRead,
		// Whether the reader may open a record of another kind: the same decision
		// the hook makes for that kind's routes, so the picker never offers a
		// record the reader could not follow to its page.
		canOpen: (kind: RecordKind) => passesFeatureGate(recordListHref(kind), org.features, canRead),
		terms: visibleTerms(org.features, canRead)
	};
}

/**
 * A link to the builder can name the record the proposal is for
 * (`?contact=<id>` from a contact's page); anything malformed is simply not
 * prefilled rather than refused — the picker is right there.
 */
function prefillFrom(url: URL): Pick<ProposalBuilder, 'entity_type' | 'entity_id'> {
	for (const kind of ['company', 'contact', 'deal'] as const) {
		const id = url.searchParams.get(kind);
		if (id !== null) return { entity_type: kind, entity_id: id };
	}
	return { entity_type: null, entity_id: null };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase } = locals;
	const { orgId, access, canOpen, terms } = contextFor(locals);
	requirePermission(access, 'proposals', 'manage');

	const [companies, contacts, deals, products, form] = await Promise.all([
		canOpen('company') ? listCompanies(supabase, orgId) : [],
		canOpen('contact') ? listContacts(supabase, orgId) : [],
		canOpen('deal') ? listDeals(supabase, orgId) : [],
		canOpen('product') ? listProducts(supabase, orgId, { activeOnly: true }) : [],
		superValidate({ ...prefillFrom(url), options: [emptyOption(1)] }, zod4(proposalBuilderSchema), {
			errors: false
		})
	]);

	return {
		form,
		parties: {
			companies: companies.map((row): PartyOption => ({
				id: row.id,
				name: row.name,
				detail: row.email
			})),
			contacts: contacts.map((row): PartyOption => ({
				id: row.id,
				name: row.name,
				detail: row.companies?.name ?? row.email
			})),
			deals: deals.map((row): PartyOption => ({
				id: row.id,
				name: row.title,
				detail: row.companies?.name ?? row.contacts?.name ?? null
			}))
		},
		products: products.map((row): CatalogProduct => ({
			id: row.id,
			name: row.name,
			kind: row.kind,
			unit_price: row.unit_price,
			currency: row.currency
		})),
		// Named the way the org's industry names the kind: "New quote".
		title: `New ${recordTerms(terms, 'proposal').noun}`
	};
};

/** The builder's rows, as the data module inserts them. */
function toOptions(options: ProposalBuilder['options']): ProposalOptionInsert[] {
	return options.map((option) => ({
		label: option.label,
		is_recommended: option.is_recommended,
		base_price: option.base_price ?? 0,
		discount_pct: option.discount_pct,
		financing_available: option.financing_available,
		// Terms mean nothing on an option that offers no financing.
		financing_term_months: option.financing_available ? option.financing_term_months : null,
		financing_apr: option.financing_available ? option.financing_apr : null,
		line_items: option.line_items.map((line) => ({
			product_id: line.product_id,
			label: line.label,
			quantity: line.quantity,
			unit_cost: line.unit_cost
		}))
	}));
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const { supabase } = locals;
		const { orgId, access } = contextFor(locals);
		requirePermission(access, 'proposals', 'manage');

		const form = await superValidate(request, zod4(proposalBuilderSchema));
		if (!form.valid) return fail(400, { form });

		let proposalId: string;
		try {
			const proposal = await createProposalWithOptions(
				supabase,
				orgId,
				{
					title: form.data.title,
					entity_type: form.data.entity_type,
					entity_id: form.data.entity_id,
					default_fee: form.data.default_fee,
					tax_rate: form.data.tax_rate,
					valid_until: form.data.valid_until
				},
				toOptions(form.data.options)
			);
			proposalId = proposal.id;
		} catch (cause) {
			// The crm module throws the PostgREST message (see crm/unwrap.ts) — a
			// policy refusal or a parent that does not exist belongs in the form.
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not create the proposal.',
				{
					status: 400
				}
			);
		}

		throw redirect(303, recordHref('proposal', proposalId));
	}
};
