import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { recordHref, recordListHref, recordTerms } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { createActivity } from '$lib/server/crm/activities';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import { listDeals } from '$lib/server/crm/deals';
import { listProducts } from '$lib/server/crm/products';
import {
	createProposalWithOptions,
	type Proposal,
	type ProposalParentKind
} from '$lib/server/crm/proposals';
import { hasGrant, requirePermission } from '$lib/server/roles';
import { emptyProposal, parentRef, proposalBuilderSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The proposal builder — how a proposal is created, in place of the generic
 * record form. A proposal is not one row: it is a title, the record it is
 * for, and one to five priced options each made of lines from the catalog,
 * which is more than a modal of string fields can hold. The screen is a port
 * of Yes Smile's treatment plan form onto the shared proposal model
 * (docs/proposals.md); the form's fields are `./schema.ts`.
 *
 * Gated by the hook on the `proposals` feature + read grant like the list;
 * opening the builder is the act of creating, so it also needs `manage`, the
 * way every add/edit does. The page has a `pages` row with no title: the
 * load names it, "New quote", as the org's industry words the kind.
 */

/** One kind of record the proposal can be for, with the rows to pick from. */
export type ProposalParentGroup = {
	kind: ProposalParentKind;
	/** The kind as the org's industry names it — "Patients", "Companies". */
	name: string;
	records: { id: string; name: string; detail: string | null }[];
};

/** A catalog row as the picker shows it; the line copies the price on pick. */
export type CatalogEntry = {
	id: string;
	name: string;
	sku: string | null;
	unit_price: number;
	unit: string | null;
	currency: string;
	category: string | null;
};

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	requirePermission(org.access, 'proposals', 'manage');

	// The pickers read four lists; a row added elsewhere refreshes them.
	depends(QUERY.companies);
	depends(QUERY.contacts);
	depends(QUERY.deals);
	depends(QUERY.products);

	// A proposal is offered only to a record the reader may open — the same
	// decision the hook makes for that kind's routes, so the picker never
	// names a kind the sidebar hides.
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: ProposalParentKind) =>
		passesFeatureGate(recordListHref(kind), features, canRead);
	const terms = visibleTerms(features, canRead);

	const [companies, contacts, deals, products, form] = await Promise.all([
		canOpen('company') ? listCompanies(supabase, activeOrgId) : [],
		canOpen('contact') ? listContacts(supabase, activeOrgId) : [],
		canOpen('deal') ? listDeals(supabase, activeOrgId) : [],
		listProducts(supabase, activeOrgId, { activeOnly: true }),
		superValidate(emptyProposal(), zod4(proposalBuilderSchema), { errors: false })
	]);

	const parents: ProposalParentGroup[] = [
		{
			kind: 'contact' as const,
			records: contacts.map((contact) => ({
				id: contact.id,
				name: contact.name,
				detail: contact.companies?.name ?? contact.email
			}))
		},
		{
			kind: 'company' as const,
			records: companies.map((company) => ({ id: company.id, name: company.name, detail: null }))
		},
		{
			kind: 'deal' as const,
			records: deals.map((deal) => ({
				id: deal.id,
				name: deal.title,
				detail: deal.companies?.name ?? deal.contacts?.name ?? null
			}))
		}
	]
		.filter((group) => canOpen(group.kind))
		.map((group) => ({ ...group, name: recordTerms(terms, group.kind).name }));

	const catalog: CatalogEntry[] = products.map((product) => ({
		id: product.id,
		name: product.name,
		sku: product.sku,
		unit_price: product.unit_price,
		unit: product.unit,
		currency: product.currency,
		category: product.product_categories?.name ?? null
	}));

	return {
		form,
		parents,
		catalog,
		// Names the page as the industry names the kind — "New treatment plan";
		// the title exception in the pages migration.
		title: `New ${recordTerms(terms, 'proposal').noun}`
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { supabase, org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');

		requirePermission(org.access, 'proposals', 'manage');

		const form = await superValidate(request, zod4(proposalBuilderSchema));
		if (!form.valid) return fail(400, { form });

		const { title, parent, valid_until, default_fee, tax_rate, notes, options } = form.data;
		const link = parentRef(parent);

		let proposal: Proposal;
		try {
			proposal = await createProposalWithOptions(
				supabase,
				activeOrgId,
				{
					title,
					entity_type: link?.entity_type ?? null,
					entity_id: link?.entity_id ?? null,
					valid_until: valid_until?.toISOString() ?? null,
					default_fee,
					tax_rate
				},
				options.map(({ line_items, ...option }) => ({ option, line_items }))
			);
			// Notes are what the CRM logs against a record — a note activity on the
			// new proposal, where the record page's timeline shows it.
			if (notes !== '') {
				await createActivity(
					supabase,
					activeOrgId,
					{ type: 'note', body: notes },
					{ entityType: 'proposal', entityId: proposal.id }
				);
			}
		} catch (cause) {
			// The crm modules throw the PostgREST message (see crm/unwrap.ts) — a
			// policy refusal or a check constraint belongs in the form, not a 500.
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not create the proposal.',
				{ status: 400 }
			);
		}

		throw redirect(303, recordHref('proposal', proposal.id));
	}
};
