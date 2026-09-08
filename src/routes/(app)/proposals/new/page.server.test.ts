import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { stringify } from 'devalue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';
import { emptyOption, type ProposalBuilder } from './schema';

/**
 * The builder from the outside: who may open it, what it offers, what it
 * refuses, and the one write it makes. The column mapping is the part worth
 * pinning — it is where the grid's columns become rows.
 */

const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '50000000-0000-0000-0000-000000000001';

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['proposals', 'read' as const]])
};
const WRITER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['proposals', 'manage' as const],
		['contacts', 'read' as const]
	])
};

/** Every CRM feature enabled, named as a CRM names it. */
function featuresFor(ids: string[]): FeatureMap {
	// SAFETY: the gate and the terms read `feature.id`, `name`, `noun`, `route`
	// and `mode` of each resolved feature; the rest of the registry row is
	// never touched by the page under test.
	return Object.fromEntries(
		ids.map((id) => [
			id,
			{
				feature: {
					id,
					name: `${id[0]?.toUpperCase() ?? ''}${id.slice(1)}`,
					noun: id.slice(0, -1),
					route: `/${id}`
				},
				mode: 'enabled'
			}
		])
	) as never;
}

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the page reads `supabase`, `activeOrgId`, `org.access` and
	// `org.features`; the rest of App.Locals is never touched here.
	return {
		supabase,
		activeOrgId: ORG_ID,
		org: {
			access,
			features: featuresFor(['companies', 'contacts', 'deals', 'products', 'proposals'])
		}
	} as never;
}

function jsonPost(payload: ProposalBuilder) {
	// superValidate checks `data instanceof Request`, so this has to be real;
	// the page posts its nested data the way `dataType: 'json'` does — one
	// devalue-encoded field on an ordinary form post.
	const body = new FormData();
	body.set('__superform_json', stringify(payload));
	return new Request('https://app.test/proposals/new', { method: 'POST', body });
}

/** Every kind the picker can list, empty unless a test says otherwise. */
function tables(results: Parameters<typeof supabaseTablesMock>[0] = {}) {
	return supabaseTablesMock({
		companies: { data: [] },
		contacts: { data: [] },
		deals: { data: [] },
		products: { data: [] },
		...results
	});
}

function submit(supabase: SupabaseClient<Database>, access: UserAccess, payload: ProposalBuilder) {
	// SAFETY: the action reads `locals` and `request` only.
	return actions.create({
		locals: localsFor(supabase, access),
		request: jsonPost(payload)
	} as never);
}

async function runLoad(supabase: SupabaseClient<Database>, access: UserAccess, search = '') {
	// SAFETY: the load reads `locals` and `url` only.
	const result = await load({
		locals: localsFor(supabase, access),
		url: new URL(`https://app.test/proposals/new${search}`)
	} as never);
	// The load always returns data or throws; the void in its type is Kit's.
	if (!result) throw new Error('the builder load returned nothing');
	return result;
}

const VALID: ProposalBuilder = {
	title: 'Crown and whitening',
	entity_type: 'contact',
	entity_id: CONTACT_ID,
	default_fee: 50,
	tax_rate: null,
	valid_until: '2026-10-01T09:00:00.000Z',
	options: [
		{
			...emptyOption(1),
			label: 'Crown only',
			base_price: 1200
		},
		{
			...emptyOption(2),
			label: 'Crown and whitening',
			is_recommended: true,
			discount_pct: 10,
			financing_available: true,
			financing_term_months: 12,
			financing_apr: 0,
			line_items: [
				{ product_id: PRODUCT_ID, label: 'Porcelain crown', quantity: 1, unit_cost: 1200 },
				{ product_id: null, label: 'Whitening session', quantity: 2, unit_cost: 150 }
			]
		}
	]
};

describe('proposal builder load', () => {
	it('refuses a reader who may not create', async () => {
		const { supabase } = tables();
		await expect(runLoad(supabase, READER)).rejects.toMatchObject({ status: 403 });
	});

	it('offers the records the writer may open, the active catalog, and a titled empty form', async () => {
		const { supabase, from } = tables({
			contacts: {
				data: [{ id: CONTACT_ID, name: 'Dana Reyes', email: 'dana@example.com', companies: null }]
			}
		});

		const result = await runLoad(supabase, WRITER);

		// A member reading contacts alone sees contacts alone: no company, deal
		// or product query is issued for a kind they could not open.
		expect(from.mock.calls.map(([table]) => table)).toEqual(['contacts']);
		expect(result.parties).toEqual({
			companies: [],
			contacts: [{ id: CONTACT_ID, name: 'Dana Reyes', detail: 'dana@example.com' }],
			deals: []
		});
		expect(result.products).toEqual([]);
		expect(result.title).toBe('New proposal');
		// A fresh form: one option, unattached, and no error shown for the
		// title nobody has typed yet.
		expect(result.form.errors).toEqual({});
		expect(result.form.data.options).toHaveLength(1);
		expect(result.form.data.entity_type).toBeNull();
	});

	it('reads only the active catalog, priced by unit_price', async () => {
		const { supabase, builders } = tables({
			products: {
				data: [
					{
						id: PRODUCT_ID,
						name: 'Porcelain crown',
						kind: 'service',
						unit_price: 1200,
						unit_cost: 400,
						currency: 'USD'
					}
				]
			}
		});

		const result = await runLoad(supabase, OWNER);
		expect(builders.products.eq).toHaveBeenCalledWith('is_active', true);
		expect(result.products).toEqual([
			{
				id: PRODUCT_ID,
				name: 'Porcelain crown',
				kind: 'service',
				unit_price: 1200,
				currency: 'USD'
			}
		]);
	});

	it('prefills the parent a link names', async () => {
		const { supabase } = tables();

		const result = await runLoad(supabase, OWNER, `?contact=${CONTACT_ID}`);
		expect(result.form.data).toMatchObject({ entity_type: 'contact', entity_id: CONTACT_ID });
	});
});

describe('proposal builder create', () => {
	it('refuses a reader without manage on the feature', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(submit(supabase, READER, VALID)).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('fails a bad post with the form, and writes nothing', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await submit(supabase, OWNER, {
			...VALID,
			title: '',
			entity_id: null,
			options: VALID.options.map((option) => ({ ...option, is_recommended: true }))
		});
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.valid', false);
		expect(result).toHaveProperty('data.form.errors.title');
		expect(result).toHaveProperty('data.form.errors.entity_id');
		expect(result).toHaveProperty('data.form.errors.options._errors');
		expect(from).not.toHaveBeenCalled();
	});

	it('writes the proposal, its options in order and their lines, then opens the record', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: { id: PROPOSAL_ID } },
			{
				data: [
					{ id: 'a2000000-0000-0000-0000-000000000001', sort_order: 0 },
					{ id: 'a2000000-0000-0000-0000-000000000002', sort_order: 1 }
				]
			},
			{ data: null }
		]);

		let redirect: unknown;
		try {
			await submit(supabase, WRITER, VALID);
		} catch (thrown) {
			redirect = thrown;
		}
		expect(isRedirect(redirect) && redirect.location).toBe(`/proposals/${PROPOSAL_ID}`);

		expect(builder.insert).toHaveBeenNthCalledWith(1, {
			title: 'Crown and whitening',
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			default_fee: 50,
			tax_rate: null,
			valid_until: '2026-10-01T09:00:00.000Z',
			org_id: ORG_ID
		});
		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({
				label: 'Crown only',
				base_price: 1200,
				discount_pct: null,
				is_recommended: false,
				financing_available: false,
				financing_term_months: null,
				financing_apr: null,
				sort_order: 0
			}),
			expect.objectContaining({
				label: 'Crown and whitening',
				// An unpriced option is 0, never null: the column's default.
				base_price: 0,
				discount_pct: 10,
				is_recommended: true,
				financing_available: true,
				financing_term_months: 12,
				financing_apr: 0,
				sort_order: 1
			})
		]);
		expect(builder.insert).toHaveBeenNthCalledWith(3, [
			expect.objectContaining({
				product_id: PRODUCT_ID,
				label: 'Porcelain crown',
				quantity: 1,
				unit_cost: 1200,
				sort_order: 0,
				proposal_option_id: 'a2000000-0000-0000-0000-000000000002'
			}),
			expect.objectContaining({
				product_id: null,
				label: 'Whitening session',
				quantity: 2,
				unit_cost: 150,
				sort_order: 1,
				proposal_option_id: 'a2000000-0000-0000-0000-000000000002'
			})
		]);
	});

	it('drops financing terms from an option that offers none', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: { id: PROPOSAL_ID } },
			{ data: [{ id: 'a2000000-0000-0000-0000-000000000001', sort_order: 0 }] }
		]);

		// The success redirect throws; only the write is of interest here.
		await Promise.resolve(
			submit(supabase, OWNER, {
				...VALID,
				options: [
					{
						...emptyOption(1),
						financing_available: false,
						financing_term_months: 24,
						financing_apr: 4.99
					}
				]
			})
		).catch(() => undefined);

		expect(builder.insert).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({ financing_term_months: null, financing_apr: null })
		]);
	});

	it('hands a database refusal back as a form message, not a 500', async () => {
		const { supabase } = supabaseMockSequence([
			{ error: { message: 'proposal parent contact does not exist in organization' } }
		]);

		const result = await submit(supabase, OWNER, VALID);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			'proposal parent contact does not exist in organization'
		);
	});
});
