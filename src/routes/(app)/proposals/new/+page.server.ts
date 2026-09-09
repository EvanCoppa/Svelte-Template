import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { memberName } from '$lib/components/staff/member';
import { billableQuantity } from '$lib/crm/billables';
import { recordHref, recordListHref, recordTerms } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { createActivity } from '$lib/server/crm/activities';
import { listBillables } from '$lib/server/crm/billables';
import { getContact, listContacts, updateContact } from '$lib/server/crm/contacts';
import { listProducts } from '$lib/server/crm/products';
import { createProposalWithOptions, type Proposal } from '$lib/server/crm/proposals';
import { listQuickPlans } from '$lib/server/crm/quick-plans';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import {
	emptyProposal,
	proposalBuilderSchema,
	type BuilderBillable,
	type BuilderContact,
	type BuilderMember,
	type BuilderProduct,
	type BuilderQuickPlan
} from '$lib/schemas/proposal-builder';
import type { Actions, PageServerLoad } from './$types';

/**
 * The proposal builder — Yes Smile's treatment plan form on the shared
 * proposal model (docs/proposals.md, "The page"). A proposal is not one row:
 * it is the person it is for, the two people on it, and one to five priced
 * options each made of billables and products, which is more than a modal of
 * string fields can hold. The form is `$lib/schemas/proposal-builder`; the
 * parts are in `./components/`.
 *
 * Gated by the hook on the `proposals` feature + read grant like the list;
 * opening the builder is the act of creating, so it also needs `manage`, the
 * way every add/edit does. The page has a `pages` row with no title: the
 * load names it, "New quote", as the org's industry words the kind.
 */

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');

	requirePermission(org.access, 'proposals', 'manage');

	// The pickers read five lists; a row added elsewhere refreshes them.
	depends(QUERY.contacts);
	depends(QUERY.staff);
	depends(QUERY.billables);
	depends(QUERY.quickPlans);
	depends(QUERY.products);

	// A list is offered only when the reader may open its feature — the same
	// decision the hook makes for that feature's routes, so the builder never
	// draws from a page the sidebar hides (a free org with quick plans locked
	// simply has no Quick Select row).
	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const offers = (route: string) => passesFeatureGate(route, features, canRead);
	const terms = visibleTerms(features, canRead);

	const [contacts, staff, billables, quickPlans, products, form] = await Promise.all([
		listContacts(supabase, activeOrgId),
		listStaff(supabase, activeOrgId),
		offers('/billables') ? listBillables(supabase, activeOrgId, { activeOnly: true }) : [],
		offers('/quick-plans') ? listQuickPlans(supabase, activeOrgId) : [],
		offers('/products') ? listProducts(supabase, activeOrgId, { activeOnly: true }) : [],
		// The signed-in member presents by default; an operator who is not a
		// member gets no default, since the membership key would refuse them.
		superValidate(emptyProposal(null), zod4(proposalBuilderSchema), { errors: false })
	]);

	const roster: BuilderMember[] = staff.map((member) => ({
		userId: member.userId,
		name: memberName(member),
		email: member.email
	}));
	if (roster.some((member) => member.userId === user.id)) form.data.presenter_id = user.id;

	return {
		form,
		contacts: contacts.map((contact): BuilderContact => ({
			id: contact.id,
			name: contact.name,
			email: contact.email,
			phone: contact.phone
		})),
		roster,
		billables: billables.map((billable): BuilderBillable => ({
			id: billable.id,
			code: billable.code,
			name: billable.name,
			unit_price: billable.unit_price,
			currency: billable.currency,
			unit: billable.unit,
			unit_choices: billable.unit_choices,
			is_featured: billable.is_featured
		})),
		quickPlans: quickPlans.map((plan): BuilderQuickPlan => ({
			id: plan.id,
			name: plan.name,
			billable_ids: plan.quick_plan_billables.map((row) => row.billables.id)
		})),
		products: products.map((product): BuilderProduct => ({
			id: product.id,
			name: product.name,
			sku: product.sku,
			unit_price: product.unit_price,
			currency: product.currency,
			unit: product.unit,
			category: product.product_categories?.name ?? null
		})),
		// The contact's email and phone are editable only for a writer who may
		// edit contacts; everyone else sees them read-only.
		canEditContact: can(access, 'contacts', 'manage'),
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

		const { contact_id, contact_email, contact_phone, notes, options, redirect_to } = form.data;

		let proposal: Proposal;
		try {
			// The person it is for, read fresh: the proposal is named after them,
			// and their details are written back only when the form changed them
			// and the writer may edit contacts.
			const contact = await getContact(supabase, activeOrgId, contact_id);
			if (!contact) return message(form, 'That record no longer exists.', { status: 400 });

			const email = contact_email === '' ? null : contact_email;
			const phone = contact_phone === '' ? null : contact_phone;
			if (
				can(org.access, 'contacts', 'manage') &&
				(email !== contact.email || phone !== contact.phone)
			) {
				await updateContact(supabase, activeOrgId, contact.id, { email, phone });
			}

			proposal = await createProposalWithOptions(
				supabase,
				activeOrgId,
				{
					title: contact.name,
					entity_type: 'contact',
					entity_id: contact.id,
					presenter_id: form.data.presenter_id,
					responsible_id: form.data.responsible_id
				},
				options.map(({ billables, products, ...option }) => ({
					option,
					// A billable line is charged per unit named; a product line per
					// quantity. Both keep the price snapshotted when they were picked.
					line_items: [
						...billables.map((line) => ({
							billable_id: line.billable_id,
							product_id: null,
							label: line.label,
							unit_cost: line.unit_cost,
							quantity: billableQuantity(line.detail, line.not_applicable),
							detail: line.not_applicable || line.detail === '' ? null : line.detail
						})),
						...products.map((line) => ({
							product_id: line.product_id,
							billable_id: null,
							label: line.label,
							unit_cost: line.unit_cost,
							quantity: line.quantity,
							detail: null
						}))
					]
				}))
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

		throw redirect(
			303,
			redirect_to === 'list' ? recordListHref('proposal') : recordHref('proposal', proposal.id)
		);
	}
};
