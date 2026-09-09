import { describe, expect, it } from 'vitest';
import { DECK_VERSION } from '$lib/schemas/decks';
import { getDeck, loadPresentation, saveDeck } from './slides';
import { ORG_ID, supabaseMock, supabaseTablesMock } from './test-support';

const USER_ID = '00000000-0000-0000-0000-000000000003';
const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000011';
const CONTEXT = {
	orgName: 'Bright Smile Dental',
	noun: 'treatment plan',
	vocabulary: { proposal_presenter: 'Presenter', proposal_responsible: 'Provider' }
};

const deck = {
	version: DECK_VERSION,
	slides: [
		{
			id: 's1',
			templateId: 'cover',
			content: { text: { heading: 'Hi' }, images: {}, colors: {}, styles: {}, variables: {} }
		}
	]
};

describe('getDeck', () => {
	it('reads the org deck by org id', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { deck_json: deck } });
		await expect(getDeck(supabase, ORG_ID)).resolves.toEqual(deck);
		expect(from).toHaveBeenCalledWith('slide_decks');
		expect(builder.select).toHaveBeenCalledWith('deck_json');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('stands in the default deck when the org has no row, or a row it cannot read', async () => {
		const none = supabaseMock({ data: null });
		const missing = await getDeck(none.supabase, ORG_ID);
		expect(missing.slides.map((slide) => slide.templateId)).toContain('option');

		const stale = supabaseMock({ data: { deck_json: { version: 99, slides: 'no' } } });
		await expect(getDeck(stale.supabase, ORG_ID)).resolves.toEqual(missing);
	});

	it('throws on a database error', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });
		await expect(getDeck(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});

describe('saveDeck', () => {
	it('upserts on the org, naming the caller as the last editor', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });
		await saveDeck(supabase, ORG_ID, USER_ID, deck);
		expect(from).toHaveBeenCalledWith('slide_decks');
		expect(builder.upsert).toHaveBeenCalledWith(
			{ org_id: ORG_ID, deck_json: deck, updated_by: USER_ID },
			{ onConflict: 'org_id' }
		);
	});
});

describe('loadPresentation', () => {
	// The rows each module reads, one table each: the proposal (with the
	// option summaries its own module embeds), the options with their lines,
	// the contact it hangs off, the presenter's profile, and the comparison
	// rows every option carries.
	const proposal = {
		id: PROPOSAL_ID,
		org_id: ORG_ID,
		title: 'Crown and whitening',
		created_at: '2026-09-01T09:00:00Z',
		valid_until: '2026-10-01T00:00:00Z',
		presenter_id: USER_ID,
		responsible_id: null,
		entity_type: 'contact',
		entity_id: CONTACT_ID,
		proposal_options: []
	};
	const options = [
		{
			id: 'opt-1',
			label: 'Porcelain crown',
			is_recommended: true,
			computed_total: 3350,
			currency: 'USD',
			duration_value: 1,
			duration_unit: 'months',
			financing_available: true,
			financing_term_months: 12,
			financing_apr: 4.99,
			proposal_line_items: [
				{
					label: 'Whitening',
					detail: 'Upper',
					quantity: 1,
					unit_cost: 450,
					total: 450,
					sort_order: 1
				},
				{
					label: 'Crown',
					detail: '12, 13',
					quantity: 2,
					unit_cost: 1450,
					total: 2900,
					sort_order: 0
				}
			]
		},
		{
			id: 'opt-2',
			label: 'Crown only',
			is_recommended: false,
			computed_total: 2900,
			currency: 'USD',
			duration_value: null,
			duration_unit: null,
			financing_available: false,
			financing_term_months: null,
			financing_apr: null,
			proposal_line_items: []
		}
	];
	const definitions = [
		{ id: 'def-1', label: 'Warranty (years)', value_type: 'numeric' },
		{ id: 'def-2', label: 'Includes onboarding', value_type: 'boolean' }
	];
	const values = [
		{ field_definition_id: 'def-1', value_numeric: 5, value_text: null, value_boolean: null }
	];

	function stack() {
		return supabaseTablesMock({
			proposals: { data: proposal },
			proposal_options: { data: options },
			contacts: { data: { id: CONTACT_ID, name: 'Dana Whitfield' } },
			profiles: { data: [{ id: USER_ID, display_name: 'Evan Coppa', email: 'evan@example.com' }] },
			custom_field_definitions: { data: definitions },
			custom_field_values: { data: values }
		});
	}

	it('names everything the slides say about one proposal', async () => {
		const { supabase, from, builders } = stack();

		const presentation = await loadPresentation(supabase, ORG_ID, PROPOSAL_ID, CONTEXT);

		expect(from).toHaveBeenCalledWith('proposal_options');
		expect(builders.proposal_options.select).toHaveBeenCalledWith('*, proposal_line_items(*)');
		expect(builders.proposal_options.eq).toHaveBeenCalledWith('proposal_id', PROPOSAL_ID);
		expect(builders.proposal_options.order).toHaveBeenCalledWith('sort_order');
		// The comparison rows are read per option, through the custom fields module.
		expect(builders.custom_field_values.eq).toHaveBeenCalledWith('entity_type', 'proposal_option');
		expect(builders.custom_field_values.eq).toHaveBeenCalledWith('entity_id', 'opt-1');
		expect(builders.custom_field_values.eq).toHaveBeenCalledWith('entity_id', 'opt-2');
		expect(builders.profiles.in).toHaveBeenCalledWith('id', [USER_ID]);

		expect(presentation).toMatchObject({
			org: { name: 'Bright Smile Dental' },
			proposal: {
				id: PROPOSAL_ID,
				title: 'Crown and whitening',
				noun: 'treatment plan',
				date: 'September 1, 2026',
				validUntil: 'October 1, 2026'
			},
			client: { name: 'Dana Whitfield' },
			presenter: { name: 'Evan Coppa' },
			responsible: null,
			labels: { presenter: 'Presenter', responsible: 'Provider' }
		});
		expect(presentation?.options).toEqual([
			{
				id: 'opt-1',
				label: 'Porcelain crown',
				recommended: true,
				total: 3350,
				currency: 'USD',
				duration: '1 month',
				financing: '12 months at 4.99% APR',
				lines: [
					{ label: 'Crown', detail: '12, 13', quantity: 2, unitCost: 1450, total: 2900 },
					{ label: 'Whitening', detail: 'Upper', quantity: 1, unitCost: 450, total: 450 }
				],
				fields: [
					{ label: 'Warranty (years)', value: '5' },
					{ label: 'Includes onboarding', value: '—' }
				]
			},
			{
				id: 'opt-2',
				label: 'Crown only',
				recommended: false,
				total: 2900,
				currency: 'USD',
				duration: null,
				financing: null,
				lines: [],
				fields: [
					{ label: 'Warranty (years)', value: '5' },
					{ label: 'Includes onboarding', value: '—' }
				]
			}
		]);
	});

	it('answers null for a proposal the org does not have, reading nothing else', async () => {
		const { supabase, from } = supabaseTablesMock({ proposals: { data: null } });
		await expect(loadPresentation(supabase, ORG_ID, PROPOSAL_ID, CONTEXT)).resolves.toBeNull();
		expect(from).toHaveBeenCalledTimes(1);
	});
});
