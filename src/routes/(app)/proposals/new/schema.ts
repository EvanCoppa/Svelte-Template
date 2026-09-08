import { z } from 'zod';
import { MONEY_MAX, proposalEntityTypeSchema } from '$lib/schemas/proposals';

/**
 * The proposal builder's one form: the proposal, and every option with its
 * lines, posted together as JSON (`dataType: 'json'` in the page). Nested on
 * purpose — an option means nothing without its proposal, and the page lays
 * the options out side by side the way the grid will show them — so this is
 * the one form in the app that needs JavaScript to post.
 *
 * The database enforces every rule here a second time (docs/proposals.md);
 * a rule in this file buys a field-level message before the round trip.
 * `computed_total` and a line's `total` are never here: the server owns them.
 */

/** The grid stays readable side by side at this many columns. */
export const MAX_OPTIONS = 5;

function hasAtMostTwoDecimals(value: number) {
	const cents = value * 100;
	return Math.abs(cents - Math.round(cents)) < 1e-6;
}

/** Money as typed: non-negative, cents precision, inside numeric(12, 2). */
const money = z
	.number('Enter an amount.')
	.min(0, 'Cannot be negative.')
	.max(MONEY_MAX, 'Amount is too large.')
	.refine(hasAtMostTwoDecimals, 'Use at most two decimal places.');

/** A percentage as stored in numeric(5, 2): 8.25 means 8.25%. */
const percent = z
	.number('Enter a percentage.')
	.min(0, 'Cannot be negative.')
	.max(100, 'Cannot exceed 100%.')
	.refine(hasAtMostTwoDecimals, 'Use at most two decimal places.');

/**
 * One priced line inside an option. `product_id` is provenance — which
 * catalog row the line was picked from, if any — and the label and cost are
 * the line's own, so repricing the catalog never rewrites this proposal.
 */
export const builderLineSchema = z.object({
	product_id: z.guid().nullable().default(null),
	label: z
		.string()
		.trim()
		.min(1, 'Give the line a label.')
		.max(200, 'Keep the label under 200 characters.'),
	quantity: z.number('Enter a quantity.').min(0, 'Cannot be negative.').default(1),
	unit_cost: money.default(0)
});

export type BuilderLine = z.infer<typeof builderLineSchema>;

/** One column of the grid: a label, its pricing, its financing, its lines. */
export const builderOptionSchema = z
	.object({
		label: z
			.string()
			.trim()
			.min(1, 'Give the option a label.')
			.max(120, 'Keep the label under 120 characters.'),
		/** The price before the lines; a plan priced only by its lines leaves it at 0. */
		base_price: money.nullable().default(null),
		/** A courtesy taken off the work, as a percentage. */
		discount_pct: percent.nullable().default(null),
		is_recommended: z.boolean().default(false),
		financing_available: z.boolean().default(false),
		financing_term_months: z
			.int('Enter whole months.')
			.min(1, 'At least one month.')
			.nullable()
			.default(null),
		financing_apr: percent.nullable().default(null),
		line_items: z.array(builderLineSchema).default([])
	})
	.refine((option) => !option.financing_available || option.financing_term_months !== null, {
		error: 'Financing needs a term in months.',
		path: ['financing_term_months']
	});

export type BuilderOption = z.infer<typeof builderOptionSchema>;

export const proposalBuilderSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1, 'Give the proposal a title.')
			.max(200, 'Keep the title under 200 characters.'),
		/** Both halves of the polymorphic parent link, or neither — an unattached draft. */
		entity_type: proposalEntityTypeSchema.nullable().default(null),
		entity_id: z.guid().nullable().default(null),
		/** Terms every option inherits. */
		default_fee: money.nullable().default(null),
		tax_rate: percent.nullable().default(null),
		valid_until: z.iso.datetime({ offset: true }).nullable().default(null),
		options: z
			.array(builderOptionSchema)
			.min(1, 'A proposal needs at least one option.')
			.max(MAX_OPTIONS, `A proposal can have at most ${String(MAX_OPTIONS)} options.`)
	})
	.refine((payload) => (payload.entity_type === null) === (payload.entity_id === null), {
		error: 'Choose both the kind of record and the record, or neither.',
		path: ['entity_id']
	})
	.refine((payload) => payload.options.filter((option) => option.is_recommended).length <= 1, {
		error: 'Only one option can be recommended.',
		path: ['options']
	});

export type ProposalBuilder = z.infer<typeof proposalBuilderSchema>;

/** A fresh option, labelled by its position the way the builder numbers them. */
export function emptyOption(position: number): BuilderOption {
	return {
		label: `Option ${String(position)}`,
		base_price: null,
		discount_pct: null,
		is_recommended: false,
		financing_available: false,
		financing_term_months: null,
		financing_apr: null,
		line_items: []
	};
}

/** A line the writer types in from scratch, tied to no catalog row. */
export function emptyLine(): BuilderLine {
	return { product_id: null, label: '', quantity: 1, unit_cost: 0 };
}
