import { z } from 'zod';
import { moneySchema, percentSchema, proposalEntityTypeSchema } from '$lib/schemas/proposals';

/**
 * The proposal builder's payload: the proposal, the record it is for, and
 * one to five priced options, each with the lines that make up its price.
 *
 * Ported from Yes Smile's treatment plan form — a patient, a set of plans,
 * and per plan a fee, a courtesy discount and the procedures and products
 * on it — onto the shared proposal model (docs/proposals.md): the patient is
 * the record the proposal hangs off, a plan is a `proposal_options` row, a
 * procedure or a product is a `proposal_line_items` row that cites the
 * catalog. Posted as one nested document (`dataType: 'json'`), so the
 * numbers arrive as numbers and the only strings are text; the database
 * enforces every rule here a second time.
 *
 * `moneySchema` / `percentSchema` are the stored shapes from
 * `$lib/schemas/proposals`; the column names are used as field names so the
 * action needs no renaming on the way to the insert.
 */

/** The most options one proposal offers — the same ceiling the source form had. */
export const MAX_OPTIONS = 5;

export const lineItemSchema = z.object({
	/** Provenance: the catalog row the line was added from, or null for a line typed in. */
	product_id: z.guid().nullable(),
	label: z
		.string()
		.trim()
		.min(1, 'Give the line a label.')
		.max(200, 'Keep the label under 200 characters.'),
	quantity: z.number({ error: 'Enter a quantity.' }).min(0, 'Cannot be negative.'),
	unit_cost: moneySchema
});

export const optionSchema = z.object({
	label: z
		.string()
		.trim()
		.min(1, 'Give the option a label.')
		.max(120, 'Keep the label under 120 characters.'),
	/** null inherits the proposal's default fee. */
	fee_override: moneySchema.nullable(),
	discount_pct: percentSchema.nullable(),
	is_recommended: z.boolean(),
	financing_available: z.boolean(),
	line_items: lineItemSchema.array()
});

/**
 * The record a proposal is for, as one picker value: `<kind>:<id>`, or blank
 * for an unattached draft. One field (not two) because the form offers one
 * grouped list — companies, people and deals together — and a pick names
 * both halves at once, so a half-set link is unrepresentable.
 */
export type ParentRef = {
	entity_type: z.infer<typeof proposalEntityTypeSchema>;
	entity_id: string;
};

export function parentValue(ref: ParentRef): string {
	return `${ref.entity_type}:${ref.entity_id}`;
}

/** The two halves of a picker value; null for blank or for anything malformed. */
export function parentRef(value: string): ParentRef | null {
	const separator = value.indexOf(':');
	if (separator === -1) return null;
	const kind = proposalEntityTypeSchema.safeParse(value.slice(0, separator));
	const id = z.guid().safeParse(value.slice(separator + 1));
	return kind.success && id.success ? { entity_type: kind.data, entity_id: id.data } : null;
}

export const proposalBuilderSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1, 'Give the proposal a title.')
			.max(200, 'Keep the title under 200 characters.'),
		parent: z.string().refine((value) => value === '' || parentRef(value) !== null, {
			error: 'Choose a record from the list.'
		}),
		valid_until: z.date().nullable(),
		default_fee: moneySchema.nullable(),
		tax_rate: percentSchema.nullable(),
		notes: z.string().trim().max(2000, 'Keep the notes under 2000 characters.'),
		options: optionSchema
			.array()
			.min(1, 'Add at least one option.')
			.max(MAX_OPTIONS, `Offer at most ${String(MAX_OPTIONS)} options.`)
	})
	.refine((payload) => payload.options.filter((option) => option.is_recommended).length <= 1, {
		error: 'Only one option can be recommended.',
		path: ['options']
	});

export type ProposalBuilder = z.infer<typeof proposalBuilderSchema>;
export type ProposalBuilderOption = z.infer<typeof optionSchema>;
export type ProposalBuilderLineItem = z.infer<typeof lineItemSchema>;

/** A line with nothing on it yet, for the "add a line" button. */
export function emptyLineItem(): ProposalBuilderLineItem {
	return { product_id: null, label: '', quantity: 1, unit_cost: 0 };
}

/** An option with nothing on it yet; the first one is recommended by default. */
export function emptyOption(label: string, recommended = false): ProposalBuilderOption {
	return {
		label,
		fee_override: null,
		discount_pct: null,
		is_recommended: recommended,
		financing_available: false,
		line_items: []
	};
}

/** What the builder opens with: an untitled draft offering one option. */
export function emptyProposal(): ProposalBuilder {
	return {
		title: '',
		parent: '',
		valid_until: null,
		default_fee: null,
		tax_rate: null,
		notes: '',
		options: [emptyOption('Option 1', true)]
	};
}
