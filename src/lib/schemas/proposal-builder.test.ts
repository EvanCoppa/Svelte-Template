import { describe, expect, it } from 'vitest';
import {
	MAX_OPTIONS,
	billableLine,
	emptyOption,
	emptyProposal,
	productLine,
	proposalBuilderSchema
} from './proposal-builder';

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const USER_ID = '00000000-0000-0000-0000-000000000003';
const BILLABLE_ID = 'c1000000-0000-0000-0000-000000000001';
const PRODUCT_ID = 'b2000000-0000-0000-0000-000000000001';

const crown = {
	id: BILLABLE_ID,
	code: 'D2740',
	name: 'Porcelain crown',
	unit_price: 1450,
	currency: 'USD',
	unit: 'tooth',
	unit_choices: null,
	is_featured: true
};
const tray = {
	id: PRODUCT_ID,
	name: 'Whitening tray',
	sku: null,
	unit_price: 120.5,
	currency: 'USD',
	unit: 'each',
	category: null
};

function messagesOf(result: { error?: { issues: { message: string }[] } }) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

/** The builder filled in as a practice would: a patient, two people, one option with both kinds of line. */
const filled = () => ({
	...emptyProposal(USER_ID),
	contact_id: CONTACT_ID,
	responsible_id: USER_ID,
	options: [
		{
			...emptyOption('Crown first', true),
			fee_override: 75,
			discount_pct: 5,
			billables: [{ ...billableLine(crown), detail: '12, 13' }],
			products: [{ ...productLine(tray), quantity: 2 }]
		}
	]
});

describe('the builder schema', () => {
	it('accepts a filled-in proposal', () => {
		const result = proposalBuilderSchema.safeParse(filled());
		expect(result.success).toBe(true);
	});

	it('requires the person it is for and the two people on it, in sentences', () => {
		const result = proposalBuilderSchema.safeParse(emptyProposal());
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
			['contact_id', 'Choose who this is for.'],
			['responsible_id', 'Choose who is responsible from the team.'],
			['presenter_id', 'Choose who presents it from the team.']
		]);
	});

	it('needs at least one option and at most the ceiling, with one recommended', () => {
		expect(messagesOf(proposalBuilderSchema.safeParse({ ...filled(), options: [] }))).toBe(
			'Add at least one option.'
		);
		const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => emptyOption(`Option ${i}`));
		expect(messagesOf(proposalBuilderSchema.safeParse({ ...filled(), options: many }))).toMatch(
			/at most 5 options/
		);
		const two = proposalBuilderSchema.safeParse({
			...filled(),
			options: [emptyOption('A', true), emptyOption('B', true)]
		});
		expect(two.error?.issues[0]).toMatchObject({
			message: 'Only one option can be recommended.',
			path: ['options']
		});
	});

	it('holds money and percentages to the stored shapes on the option and its lines', () => {
		const bad = proposalBuilderSchema.safeParse({
			...filled(),
			options: [
				{
					...emptyOption('A'),
					fee_override: 1.005,
					discount_pct: 101,
					billables: [{ ...billableLine(crown), unit_cost: -1 }],
					products: [{ ...productLine(tray), quantity: 0 }]
				}
			]
		});
		expect(bad.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
			'options.0.fee_override',
			'options.0.discount_pct',
			'options.0.billables.0.unit_cost',
			'options.0.products.0.quantity'
		]);
	});

	it('takes a blank email and refuses a malformed one', () => {
		expect(proposalBuilderSchema.safeParse({ ...filled(), contact_email: '' }).success).toBe(true);
		expect(
			messagesOf(proposalBuilderSchema.safeParse({ ...filled(), contact_email: 'nope' }))
		).toBe('Enter a valid email address.');
	});
});

describe('the empty shapes', () => {
	it('opens with the presenter filled in, one recommended option, and the record as the destination', () => {
		expect(emptyProposal(USER_ID)).toMatchObject({
			presenter_id: USER_ID,
			responsible_id: '',
			redirect_to: 'record',
			options: [emptyOption('Option 1', true)]
		});
		expect(emptyProposal().presenter_id).toBe('');
	});

	it('snapshots the price when a line is picked', () => {
		expect(billableLine(crown)).toEqual({
			billable_id: BILLABLE_ID,
			label: 'Porcelain crown',
			unit_cost: 1450,
			detail: '',
			not_applicable: false
		});
		expect(productLine(tray)).toEqual({
			product_id: PRODUCT_ID,
			label: 'Whitening tray',
			quantity: 1,
			unit_cost: 120.5
		});
	});
});
