import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { stringify } from 'devalue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { Feature, FeatureMap, FeatureMode } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';
import { emptyOption, emptyProposal, type ProposalBuilder } from '$lib/schemas/proposal-builder';

/**
 * The builder from the outside: who may open it, what the pickers offer,
 * what one post writes — in which order, with which quantities — and where
 * it lands. The form is posted the way `dataType: 'json'` posts it, so the
 * action is exercised through superforms' own parsing, not around it.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const MEMBER: UserAccess = { role: 'member', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['proposals', 'read' as const]])
};
/** May write proposals and read the schedule, but not edit patients nor see quick plans. */
const HYGIENIST: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['proposals', 'manage' as const],
		['contacts', 'read' as const],
		['billables', 'read' as const],
		['products', 'read' as const]
	])
};

const USER_ID = '00000000-0000-0000-0000-000000000003';
const OTHER_ID = '00000000-0000-0000-0000-000000000001';
const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000009';
const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const CROWN_ID = 'c1000000-0000-0000-0000-000000000001';
const SCALING_ID = 'c1000000-0000-0000-0000-000000000002';
const PRODUCT_ID = 'b2000000-0000-0000-0000-000000000001';

function feature(id: string, route: string, name: string, noun: string | null): Feature {
	return {
		id,
		name,
		noun,
		description: null,
		route,
		icon: null,
		category: 'platform',
		sort_order: 0,
		created_at: '2026-01-01T00:00:00Z'
	};
}

/** A dental practice's map: people are patients, and quick plans may be locked. */
function features(quickPlansMode: FeatureMode = 'enabled'): FeatureMap {
	return {
		proposals: {
			feature: feature('proposals', '/proposals', 'Treatment plans', 'treatment plan'),
			mode: 'enabled'
		},
		contacts: { feature: feature('contacts', '/contacts', 'Patients', 'patient'), mode: 'enabled' },
		billables: {
			feature: feature('billables', '/billables', 'Procedures', 'procedure'),
			mode: 'enabled'
		},
		'quick-plans': {
			feature: feature('quick-plans', '/quick-plans', 'Quick plans', 'quick plan'),
			mode: quickPlansMode
		},
		products: { feature: feature('products', '/products', 'Products', 'product'), mode: 'enabled' }
	};
}

function localsFor(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	map: FeatureMap = features()
): App.Locals {
	// SAFETY: the load and the action read `supabase`, `activeOrgId`, `user.id`,
	// `org.access` and `org.features`; the rest of App.Locals is never touched.
	return {
		supabase,
		activeOrgId: ORG_ID,
		user: { id: USER_ID },
		org: { access, features: map }
	} as never;
}

/** What `dataType: 'json'` posts: the whole document under one field, devalue-encoded. */
function post(data: ProposalBuilder) {
	const body = new FormData();
	body.set('__superform_json', stringify(data));
	return new Request('https://app.test/proposals/new', { method: 'POST', body });
}

function submit(supabase: SupabaseClient<Database>, access: UserAccess, data: ProposalBuilder) {
	// SAFETY: the action reads `request` and `locals` only.
	return actions.create({ request: post(data), locals: localsFor(supabase, access) } as never);
}

async function runLoad(supabase: SupabaseClient<Database>, access: UserAccess, map?: FeatureMap) {
	// SAFETY: the load reads `locals` and calls `depends`; nothing else on the event.
	const data = await load({ locals: localsFor(supabase, access, map), depends: vi.fn() } as never);
	// A load may answer nothing; this one always answers, so say so once.
	if (!data) throw new Error('expected the builder load to return data');
	return data;
}

async function redirectOf<T>(runIt: () => T) {
	try {
		await runIt();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('expected a redirect');
}

const dana = {
	id: CONTACT_ID,
	name: 'Dana Reyes',
	email: 'dana@example.com',
	phone: null,
	companies: null
};

/** The builder filled in: a patient, two people, one option with both kinds of line. */
const filled: ProposalBuilder = {
	...emptyProposal(USER_ID),
	contact_id: CONTACT_ID,
	contact_email: 'dana@example.com',
	contact_phone: '',
	responsible_id: OTHER_ID,
	notes: 'Discussed at the consult.',
	options: [
		{
			...emptyOption('Crown first', true),
			fee_override: 75,
			discount_pct: 5,
			billables: [
				{
					billable_id: CROWN_ID,
					label: 'Porcelain crown',
					unit_cost: 1450,
					detail: '12, 13',
					not_applicable: false
				},
				{
					billable_id: SCALING_ID,
					label: 'Scaling',
					unit_cost: 275,
					detail: '',
					not_applicable: true
				}
			],
			products: [{ product_id: PRODUCT_ID, label: 'Whitening tray', quantity: 2, unit_cost: 120.5 }]
		},
		emptyOption('Composite')
	]
};

describe('the builder load', () => {
	it('refuses whoever may not write proposals, before reading anything', async () => {
		const { supabase, from } = supabaseTablesMock({});

		await expect(runLoad(supabase, READER)).rejects.toMatchObject({ status: 403 });
		await expect(runLoad(supabase, MEMBER)).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('offers the patients, the roster and the schedule, and presents as the signed-in member', async () => {
		const { supabase } = supabaseTablesMock({
			contacts: { data: [dana] },
			organization_members: {
				data: [
					{
						user_id: USER_ID,
						role: 'owner',
						created_at: '2026-01-01T00:00:00Z',
						profiles: { display_name: 'Evan Coppa', email: 'evan@example.com', avatar_url: null },
						member_roles: []
					},
					{
						user_id: OTHER_ID,
						role: 'member',
						created_at: '2026-01-01T00:00:00Z',
						profiles: { display_name: null, email: 'dev@example.com', avatar_url: null },
						member_roles: []
					}
				]
			},
			billables: {
				data: [
					{
						id: CROWN_ID,
						code: 'D2740',
						name: 'Porcelain crown',
						unit_price: 1450,
						currency: 'USD',
						unit: 'tooth',
						unit_choices: null,
						is_featured: true,
						is_active: true
					}
				]
			},
			quick_plans: {
				data: [
					{
						id: 'qp1',
						name: 'Crown and whitening',
						quick_plan_billables: [{ sort_order: 0, billables: { id: CROWN_ID } }]
					}
				]
			},
			products: { data: [] }
		});

		const result = await runLoad(supabase, OWNER);
		expect(result.contacts).toEqual([
			{ id: CONTACT_ID, name: 'Dana Reyes', email: 'dana@example.com', phone: null }
		]);
		// Named the way the staff roster names a member: display name, else email.
		expect(result.roster).toEqual([
			{ userId: OTHER_ID, name: 'dev@example.com', email: 'dev@example.com' },
			{ userId: USER_ID, name: 'Evan Coppa', email: 'evan@example.com' }
		]);
		expect(result.form.data.presenter_id).toBe(USER_ID);
		expect(result.billables).toEqual([
			{
				id: CROWN_ID,
				code: 'D2740',
				name: 'Porcelain crown',
				unit_price: 1450,
				currency: 'USD',
				unit: 'tooth',
				unit_choices: null,
				is_featured: true
			}
		]);
		expect(result.quickPlans).toEqual([
			{ id: 'qp1', name: 'Crown and whitening', billable_ids: [CROWN_ID] }
		]);
		expect(result.canEditContact).toBe(true);
		expect(result.title).toBe('New treatment plan');
	});

	it('leaves out what the reader may not open, and the default presenter for a non-member', async () => {
		const { supabase, from } = supabaseTablesMock({
			contacts: { data: [] },
			organization_members: { data: [] },
			billables: { data: [] },
			products: { data: [] }
		});

		// Quick plans are locked for the org, and the hygienist may not edit patients.
		const result = await runLoad(supabase, HYGIENIST, features('locked_visible'));
		expect(from).not.toHaveBeenCalledWith('quick_plans');
		expect(result.quickPlans).toEqual([]);
		expect(result.canEditContact).toBe(false);
		// Not on the roster: nobody presents by default.
		expect(result.form.data.presenter_id).toBe('');
	});
});

describe('the create action', () => {
	it('refuses a member without manage on proposals, and writes nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(submit(supabase, READER, filled)).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('fails a post missing its people with the form, and writes nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await submit(supabase, OWNER, { ...filled, responsible_id: '' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.valid', false);
		expect(result).toHaveProperty('data.form.errors.responsible_id');
		expect(from).not.toHaveBeenCalled();
	});

	it('names the proposal after the patient, counts units, notes it, and opens the record', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: dana },
			{ data: { id: PROPOSAL_ID } },
			{
				data: [
					{ id: 'opt-1', sort_order: 0 },
					{ id: 'opt-2', sort_order: 1 }
				]
			},
			{ data: null },
			{ data: { id: 'note' } }
		]);

		const redirect = await redirectOf(() => submit(supabase, OWNER, filled));
		expect(redirect).toMatchObject({ status: 303, location: `/proposals/${PROPOSAL_ID}` });

		expect(from).toHaveBeenNthCalledWith(1, 'contacts');
		expect(from).toHaveBeenNthCalledWith(2, 'proposals');
		expect(from).toHaveBeenNthCalledWith(3, 'proposal_options');
		expect(from).toHaveBeenNthCalledWith(4, 'proposal_line_items');
		expect(from).toHaveBeenNthCalledWith(5, 'activities');
		// The patient's details did not change, so nothing was written back.
		expect(builder.update).not.toHaveBeenCalled();

		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			title: 'Dana Reyes',
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			presenter_id: USER_ID,
			responsible_id: OTHER_ID,
			org_id: ORG_ID
		});

		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({
				label: 'Crown first',
				fee_override: 75,
				discount_pct: 5,
				is_recommended: true,
				financing_available: true,
				sort_order: 0
			}),
			expect.objectContaining({ label: 'Composite', sort_order: 1 })
		]);

		// Two teeth is two units; N/A is one with no detail; a product keeps
		// its quantity. Every line keeps the price it was picked at.
		expect(builder.insert).toHaveBeenNthCalledWith(3, [
			expect.objectContaining({
				billable_id: CROWN_ID,
				product_id: null,
				label: 'Porcelain crown',
				quantity: 2,
				unit_cost: 1450,
				detail: '12, 13',
				proposal_option_id: 'opt-1',
				sort_order: 0
			}),
			expect.objectContaining({
				billable_id: SCALING_ID,
				quantity: 1,
				detail: null,
				sort_order: 1
			}),
			expect.objectContaining({
				product_id: PRODUCT_ID,
				billable_id: null,
				quantity: 2,
				unit_cost: 120.5,
				detail: null,
				sort_order: 2
			})
		]);

		expect(builder.insert).toHaveBeenNthCalledWith(4, {
			type: 'note',
			body: 'Discussed at the consult.',
			org_id: ORG_ID,
			entity_type: 'proposal',
			entity_id: PROPOSAL_ID
		});
	});

	it('writes changed contact details back for a writer who may edit patients, and lands on the list', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: dana },
			{ data: { ...dana, phone: '+1 555 010 0100' } },
			{ data: { id: PROPOSAL_ID } },
			{ data: [{ id: 'opt-1', sort_order: 0 }] }
		]);

		const redirect = await redirectOf(() =>
			submit(supabase, OWNER, {
				...filled,
				contact_phone: '+1 555 010 0100',
				notes: '',
				redirect_to: 'list',
				options: [emptyOption('Only', true)]
			})
		);
		expect(redirect).toMatchObject({ status: 303, location: '/proposals' });
		expect(from).toHaveBeenNthCalledWith(2, 'contacts');
		expect(builder.update).toHaveBeenCalledWith({
			email: 'dana@example.com',
			phone: '+1 555 010 0100'
		});
		// No lines and no notes: neither table is touched.
		expect(from).not.toHaveBeenCalledWith('proposal_line_items');
		expect(from).not.toHaveBeenCalledWith('activities');
	});

	it('never writes contact details for a writer who may not edit patients', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: dana },
			{ data: { id: PROPOSAL_ID } },
			{ data: [{ id: 'opt-1', sort_order: 0 }] }
		]);

		await redirectOf(() =>
			submit(supabase, HYGIENIST, {
				...filled,
				contact_phone: '+1 555 010 0100',
				notes: '',
				options: [emptyOption('Only', true)]
			})
		);
		expect(builder.update).not.toHaveBeenCalled();
	});

	it('refuses a patient that no longer exists as a form message', async () => {
		const { supabase } = supabaseMockSequence([{ data: null }]);

		const result = await submit(supabase, OWNER, filled);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', 'That record no longer exists.');
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMockSequence([
			{ data: dana },
			{ error: { message: 'new row violates row-level security policy' } }
		]);

		const result = await submit(supabase, OWNER, filled);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			'new row violates row-level security policy'
		);
	});
});
