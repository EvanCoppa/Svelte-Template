import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { stringify } from 'devalue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { Feature, FeatureMap, FeatureMode } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load, type ProposalParentGroup } from './+page.server';
import { emptyOption, emptyProposal, type ProposalBuilder } from './schema';

/**
 * The builder from the outside: who may open it, what the pickers offer,
 * what one post writes — in which order, with which sort orders — and where
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
/** May write proposals and read contacts, but deals are closed to them. */
const CLINICIAN: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['proposals', 'manage' as const],
		['contacts', 'read' as const],
		['companies', 'read' as const]
	])
};

const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000009';
const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const PRODUCT_ID = '50000000-0000-0000-0000-000000000001';

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

/** A dental practice's map: people are patients, and there is no deal pipeline. */
function features(dealsMode: FeatureMode = 'hidden'): FeatureMap {
	return {
		proposals: {
			feature: feature('proposals', '/proposals', 'Treatment plans', 'treatment plan'),
			mode: 'enabled'
		},
		contacts: { feature: feature('contacts', '/contacts', 'Patients', 'patient'), mode: 'enabled' },
		companies: {
			feature: feature('companies', '/companies', 'Companies', 'company'),
			mode: 'enabled'
		},
		deals: { feature: feature('deals', '/deals', 'Deals', 'deal'), mode: dealsMode }
	};
}

function localsFor(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	map: FeatureMap = features()
): App.Locals {
	// SAFETY: the load and the action read `supabase`, `activeOrgId`,
	// `org.access` and `org.features`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access, features: map } } as never;
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

/** The tables a call touched, in order — what the mock's untyped call list cannot say. */
function tablesOf(from: ReturnType<typeof supabaseMockSequence>['from']): string[] {
	return from.mock.calls.map((call: unknown[]) => String(call[0]));
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

const filled: ProposalBuilder = {
	...emptyProposal(),
	title: 'Crown and whitening',
	parent: `contact:${CONTACT_ID}`,
	valid_until: new Date('2026-10-01T09:00:00Z'),
	default_fee: 250,
	tax_rate: 8.25,
	notes: 'Discussed at the consult.',
	options: [
		{
			...emptyOption('Porcelain crown', true),
			fee_override: 0,
			discount_pct: 5,
			financing_available: true,
			line_items: [
				{ product_id: PRODUCT_ID, label: 'Crown', quantity: 1, unit_cost: 1450 },
				{ product_id: null, label: 'Whitening', quantity: 2, unit_cost: 120.5 }
			]
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

	it('offers the records the reader may open, named as the industry names them', async () => {
		const { supabase, from } = supabaseTablesMock({
			contacts: {
				data: [
					{ id: CONTACT_ID, name: 'Dana Reyes', email: 'dana@example.com', companies: null },
					{ id: 'c2', name: 'Sam Ortiz', email: null, companies: { id: 'co', name: 'Acme' } }
				]
			},
			companies: { data: [{ id: 'co', name: 'Acme' }] },
			deals: { data: [{ id: 'd1', title: 'Should not be offered' }] },
			products: { data: [] }
		});

		const result = await runLoad(supabase, CLINICIAN);

		// Deals are hidden from the org, so they are never even queried.
		expect(from).not.toHaveBeenCalledWith('deals');
		expect(result.parents).toEqual([
			{
				kind: 'contact',
				name: 'Patients',
				records: [
					{ id: CONTACT_ID, name: 'Dana Reyes', detail: 'dana@example.com' },
					{ id: 'c2', name: 'Sam Ortiz', detail: 'Acme' }
				]
			},
			{ kind: 'company', name: 'Companies', records: [{ id: 'co', name: 'Acme', detail: null }] }
		]);
		expect(result.title).toBe('New treatment plan');
	});

	it('lists deals for an owner when the org has a pipeline', async () => {
		const { supabase } = supabaseTablesMock({
			contacts: { data: [] },
			companies: { data: [] },
			products: { data: [] },
			deals: {
				data: [
					{ id: 'd1', title: 'Re-roof', companies: { id: 'co', name: 'Wayne' }, contacts: null }
				]
			}
		});

		const result = await runLoad(supabase, OWNER, features('enabled'));
		expect(result.parents.map((group: ProposalParentGroup) => group.kind)).toEqual([
			'contact',
			'company',
			'deal'
		]);
		expect(result.parents[2]?.records).toEqual([{ id: 'd1', name: 'Re-roof', detail: 'Wayne' }]);
	});

	it('ships the live catalog, filed by category, and an untitled draft with one option', async () => {
		const { supabase, builders } = supabaseTablesMock({
			contacts: { data: [] },
			companies: { data: [] },
			deals: { data: [] },
			products: {
				data: [
					{
						id: PRODUCT_ID,
						name: 'Porcelain crown',
						sku: 'D2740',
						unit_price: 1450,
						unit: 'tooth',
						currency: 'USD',
						product_categories: { id: 'cat', name: 'Restorative' }
					}
				]
			}
		});

		const result = await runLoad(supabase, OWNER);
		expect(builders.products?.eq).toHaveBeenCalledWith('is_active', true);
		expect(result.catalog).toEqual([
			{
				id: PRODUCT_ID,
				name: 'Porcelain crown',
				sku: 'D2740',
				unit_price: 1450,
				unit: 'tooth',
				currency: 'USD',
				category: 'Restorative'
			}
		]);
		expect(result.form.data).toEqual(emptyProposal());
		expect(result.form.errors).toEqual({});
	});
});

describe('the create action', () => {
	it('refuses a member without manage on proposals, and writes nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(submit(supabase, READER, filled)).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('fails a bad post with the form, and writes nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await submit(supabase, OWNER, { ...filled, title: '  ' });
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.valid', false);
		expect(result).toHaveProperty('data.form.errors.title');
		expect(from).not.toHaveBeenCalled();
	});

	it('writes the proposal, its options and their lines in order, notes it, and lands on the record', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
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

		expect(tablesOf(from)).toEqual([
			'proposals',
			'proposal_options',
			'proposal_line_items',
			'activities'
		]);

		// The proposal: attached to the picked record, validity as an instant,
		// the shared terms as typed.
		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			title: 'Crown and whitening',
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			valid_until: '2026-10-01T09:00:00.000Z',
			default_fee: 250,
			tax_rate: 8.25,
			org_id: ORG_ID
		});

		// The options, in one statement, ordered by their position.
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			{
				label: 'Porcelain crown',
				fee_override: 0,
				discount_pct: 5,
				is_recommended: true,
				financing_available: true,
				org_id: ORG_ID,
				proposal_id: PROPOSAL_ID,
				sort_order: 0
			},
			{
				label: 'Composite',
				fee_override: null,
				discount_pct: null,
				is_recommended: false,
				financing_available: false,
				org_id: ORG_ID,
				proposal_id: PROPOSAL_ID,
				sort_order: 1
			}
		]);

		// The lines, joined to their option, keeping the catalog citation and
		// the price as typed — never the catalog's live price.
		expect(builder.insert).toHaveBeenNthCalledWith(3, [
			{
				product_id: PRODUCT_ID,
				label: 'Crown',
				quantity: 1,
				unit_cost: 1450,
				org_id: ORG_ID,
				proposal_option_id: 'opt-1',
				sort_order: 0
			},
			{
				product_id: null,
				label: 'Whitening',
				quantity: 2,
				unit_cost: 120.5,
				org_id: ORG_ID,
				proposal_option_id: 'opt-1',
				sort_order: 1
			}
		]);

		// The notes, as a note activity against the new proposal.
		expect(builder.insert).toHaveBeenNthCalledWith(4, {
			type: 'note',
			body: 'Discussed at the consult.',
			org_id: ORG_ID,
			entity_type: 'proposal',
			entity_id: PROPOSAL_ID
		});
	});

	it('leaves an unattached, undated, unannotated draft exactly that', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: { id: PROPOSAL_ID } },
			{ data: [{ id: 'opt-1', sort_order: 0 }] }
		]);

		await redirectOf(() =>
			submit(supabase, OWNER, { ...emptyProposal(), title: 'Crown and whitening' })
		);

		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			title: 'Crown and whitening',
			entity_type: null,
			entity_id: null,
			valid_until: null,
			default_fee: null,
			tax_rate: null,
			org_id: ORG_ID
		});
		// No lines and no notes: neither table is touched.
		expect(tablesOf(from)).toEqual(['proposals', 'proposal_options']);
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMockSequence([
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
