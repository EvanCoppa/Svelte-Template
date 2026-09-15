import { describe, expect, it, vi } from 'vitest';
import { stringify } from 'devalue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { Feature, FeatureMap } from '$lib/features/types';
import { DECK_VERSION, type SlideDeck } from '$lib/schemas/decks';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The builder from the outside: who may open it, what it hands the page,
 * and what one Save writes. The form is posted the way `dataType: 'json'`
 * posts it, so the action is exercised through superforms' own parsing.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['proposals', 'read' as const]])
};
const EDITOR: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['proposals', 'manage' as const]])
};

const USER_ID = '00000000-0000-0000-0000-000000000003';

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

/** A dental practice: the noun is "treatment plan", the people a Presenter and a Provider. */
const FEATURES: FeatureMap = {
	proposals: {
		feature: feature('proposals', '/proposals', 'Treatment plans', 'treatment plan'),
		mode: 'enabled'
	}
};
const TERMS = [
	{
		id: 'proposal_presenter',
		label: 'Presenter',
		industry_terms: [{ industry_id: 'dentistry', label: 'Presenter' }]
	},
	{
		id: 'proposal_responsible',
		label: 'Responsible',
		industry_terms: [{ industry_id: 'dentistry', label: 'Provider' }]
	},
	{
		id: 'graph_member',
		label: 'Team member',
		industry_terms: [{ industry_id: 'dentistry', label: 'Team member' }]
	}
];

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load and the action read `supabase`, `activeOrgId`, `user.id`,
	// `org.access`, `org.features` and `org.activeOrg`; nothing else on Locals.
	return {
		supabase,
		activeOrgId: ORG_ID,
		user: { id: USER_ID },
		org: {
			access,
			features: FEATURES,
			activeOrg: { id: ORG_ID, name: 'Bright Smile Dental', industryId: 'dentistry' }
		}
	} as never;
}

const deck = {
	version: DECK_VERSION,
	slides: [
		{
			id: 's1',
			templateId: 'v1-title',
			content: { text: { heading: 'Hello' }, images: {}, colors: {}, styles: {}, variables: {} }
		}
	]
};

function stack(saved: SlideDeck | null = null) {
	return supabaseTablesMock({
		slide_decks: { data: saved ? { deck_json: saved } : null },
		terms: { data: TERMS }
	});
}

async function runLoad(supabase: SupabaseClient<Database>, access: UserAccess) {
	// SAFETY: the load reads `locals` and calls `depends`; nothing else on the event.
	const data = await load({ locals: localsFor(supabase, access), depends: vi.fn() } as never);
	if (!data) throw new Error('expected the builder load to return data');
	return data;
}

/** What `dataType: 'json'` posts: the whole document under one field, devalue-encoded. */
function post(supabase: SupabaseClient<Database>, access: UserAccess, body: FormData) {
	const request = new Request('https://app.test/proposals/slides', { method: 'POST', body });
	// SAFETY: the action reads `request` and `locals` only.
	return actions.save({ request, locals: localsFor(supabase, access) } as never);
}

function submit(supabase: SupabaseClient<Database>, access: UserAccess, saved: SlideDeck) {
	const body = new FormData();
	body.set('__superform_json', stringify({ deck: saved }));
	return post(supabase, access, body);
}

describe('load', () => {
	it('refuses a reader: the builder takes manage', async () => {
		await expect(runLoad(stack().supabase, READER)).rejects.toMatchObject({ status: 403 });
	});

	it('hands an editor the org deck as the form, and a sample in the industry words', async () => {
		const { supabase, builders } = stack(deck);
		const data = await runLoad(supabase, EDITOR);
		expect(builders.slide_decks.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(data.form.data.deck).toEqual(deck);
		expect(data.sample.org.name).toBe('Bright Smile Dental');
		expect(data.sample.proposal.noun).toBe('treatment plan');
		expect(data.sample.labels).toEqual({ presenter: 'Presenter', responsible: 'Provider' });
	});

	it('starts an org with no row on the default deck', async () => {
		const data = await runLoad(stack().supabase, OWNER);
		expect(
			data.form.data.deck.slides.map((slide: { templateId: string }) => slide.templateId)
		).toContain('option');
	});
});

describe('save', () => {
	it('refuses a reader', async () => {
		await expect(submit(stack().supabase, READER, deck)).rejects.toMatchObject({ status: 403 });
	});

	it('refuses a deck that is not one: nothing is written', async () => {
		const { supabase, from } = stack();
		const body = new FormData();
		body.set('__superform_json', stringify({ deck: { version: 1, slides: 'no' } }));
		const result = await post(supabase, EDITOR, body);
		expect(result).toMatchObject({ status: 400 });
		expect(from).not.toHaveBeenCalledWith('slide_decks');
	});

	it('upserts the deck on the org as the caller and says so', async () => {
		const { supabase, builders } = stack();
		const result = await submit(supabase, EDITOR, deck);
		expect(builders.slide_decks.upsert).toHaveBeenCalledWith(
			{ org_id: ORG_ID, deck_json: deck, updated_by: USER_ID },
			{ onConflict: 'org_id' }
		);
		expect(result).toMatchObject({ form: { valid: true, message: 'Saved' } });
	});

	it('reports a refusal from the database on the form', async () => {
		const { supabase } = supabaseTablesMock({
			slide_decks: { error: { message: 'new row violates row-level security policy' } }
		});
		const result = await submit(supabase, EDITOR, deck);
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: expect.stringMatching(/row-level security/) } }
		});
	});
});
