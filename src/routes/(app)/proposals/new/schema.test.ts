import { describe, expect, it } from 'vitest';
import {
	MAX_OPTIONS,
	emptyLineItem,
	emptyOption,
	emptyProposal,
	parentRef,
	parentValue,
	proposalBuilderSchema
} from './schema';

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const PRODUCT_ID = '50000000-0000-0000-0000-000000000001';

function messagesOf(result: { error?: { issues: { message: string }[] } }) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

describe('the builder schema', () => {
	it('accepts what the builder opens with, once titled', () => {
		const result = proposalBuilderSchema.safeParse({ ...emptyProposal(), title: 'Crown' });
		expect(result.success).toBe(true);
	});

	it('accepts a full proposal: attached, dated, priced, with catalog and custom lines', () => {
		const result = proposalBuilderSchema.safeParse({
			title: '  Crown and whitening  ',
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
					line_items: [
						{ product_id: PRODUCT_ID, label: 'Crown', quantity: 1, unit_cost: 1450 },
						{ product_id: null, label: 'Whitening tray', quantity: 2, unit_cost: 120.5 }
					]
				},
				emptyOption('Composite')
			]
		});
		expect(result.success).toBe(true);
		expect(result.data?.title).toBe('Crown and whitening');
	});

	it('requires a title and at least one option, and says so in sentences', () => {
		expect(messagesOf(proposalBuilderSchema.safeParse({ ...emptyProposal(), title: ' ' }))).toBe(
			'Give the proposal a title.'
		);
		expect(
			messagesOf(proposalBuilderSchema.safeParse({ ...emptyProposal(), title: 'X', options: [] }))
		).toBe('Add at least one option.');
	});

	it('caps the options at the ceiling the source form had', () => {
		const options = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => emptyOption(`Option ${i}`));
		expect(
			messagesOf(proposalBuilderSchema.safeParse({ ...emptyProposal(), title: 'X', options }))
		).toMatch(/at most 5 options/);
	});

	it('lets at most one option be recommended, reporting on the options as a whole', () => {
		const result = proposalBuilderSchema.safeParse({
			...emptyProposal(),
			title: 'X',
			options: [emptyOption('A', true), emptyOption('B', true)]
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]).toMatchObject({
			message: 'Only one option can be recommended.',
			path: ['options']
		});
	});

	it('refuses a parent that is not a kind a proposal may hang off, or not an id', () => {
		for (const parent of ['product:' + CONTACT_ID, 'contact:nope', 'contact', CONTACT_ID]) {
			expect(
				messagesOf(proposalBuilderSchema.safeParse({ ...emptyProposal(), title: 'X', parent }))
			).toBe('Choose a record from the list.');
		}
	});

	it('holds money to cents and percentages to 100, on the proposal, an option and a line', () => {
		const bad = proposalBuilderSchema.safeParse({
			...emptyProposal(),
			title: 'X',
			default_fee: 1.005,
			tax_rate: 101,
			options: [
				{
					...emptyOption('A'),
					discount_pct: -1,
					line_items: [{ ...emptyLineItem(), label: 'L', unit_cost: -5 }]
				}
			]
		});
		expect(bad.success).toBe(false);
		expect(bad.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
			'default_fee',
			'tax_rate',
			'options.0.discount_pct',
			'options.0.line_items.0.unit_cost'
		]);
	});

	it('needs a quantity and a label on every line', () => {
		const result = proposalBuilderSchema.safeParse({
			...emptyProposal(),
			title: 'X',
			options: [{ ...emptyOption('A'), line_items: [{ ...emptyLineItem(), quantity: null }] }]
		});
		expect(messagesOf(result)).toBe('Give the line a label. Enter a quantity.');
	});
});

describe('the parent picker value', () => {
	it('round-trips a kind and an id through one string', () => {
		const ref = { entity_type: 'contact' as const, entity_id: CONTACT_ID };
		expect(parentValue(ref)).toBe(`contact:${CONTACT_ID}`);
		expect(parentRef(parentValue(ref))).toEqual(ref);
	});

	it('reads blank and anything malformed as no parent', () => {
		expect(parentRef('')).toBeNull();
		expect(parentRef('contact')).toBeNull();
		expect(parentRef(`proposal:${CONTACT_ID}`)).toBeNull();
		expect(parentRef('contact:not-a-uuid')).toBeNull();
	});
});

describe('the empty shapes', () => {
	it('opens with one recommended option and no lines', () => {
		expect(emptyProposal().options).toEqual([emptyOption('Option 1', true)]);
		expect(emptyOption('B')).toMatchObject({ is_recommended: false, line_items: [] });
		expect(emptyLineItem()).toEqual({ product_id: null, label: '', quantity: 1, unit_cost: 0 });
	});
});
