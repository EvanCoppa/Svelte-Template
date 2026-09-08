import { z } from 'zod';
import { moneySchema, percentSchema } from './proposals';

/**
 * The proposal builder's payload — the form at `/proposals/new`, ported from
 * Yes Smile's treatment plan form onto the shared proposal model
 * (docs/proposals.md, "The page"): the person it is for, the two people on
 * it, and one to five options, each made of billables (counted in units) and
 * products (counted in quantities).
 *
 * Posted as one nested document (`dataType: 'json'`), so the numbers arrive
 * as numbers and the only strings are text; the database enforces every rule
 * here a second time. `moneySchema` / `percentSchema` are the stored shapes;
 * the column names are used as field names so the action needs no renaming.
 *
 * In `src/lib/schemas/` rather than beside the route because the builder's
 * parts (`$lib/components/proposal-builder`) type their props with it.
 */

/** The most options one proposal offers — the same ceiling the source form had. */
export const MAX_OPTIONS = 5;

const lineLabel = z
	.string()
	.trim()
	.min(1, 'Give the line a label.')
	.max(200, 'Keep the label under 200 characters.');

/** A line from the fee schedule: priced per unit, the units named in `detail`. */
export const billableLineSchema = z.object({
	billable_id: z.guid(),
	label: lineLabel,
	/** The price at pick time — never re-read from the schedule on save. */
	unit_cost: moneySchema,
	/** The units as typed or picked: "12, 13", "UR, UL". Quantity is their count. */
	detail: z.string().trim().max(200, 'Keep the units under 200 characters.'),
	/** No units make sense for this line: it counts as one. */
	not_applicable: z.boolean()
});

/** A line from the products catalog: priced per unit, counted with a quantity. */
export const productLineSchema = z.object({
	product_id: z.guid(),
	label: lineLabel,
	quantity: z.int({ error: 'Enter a quantity.' }).min(1, 'At least one.'),
	unit_cost: moneySchema
});

export const optionSchema = z.object({
	label: z
		.string()
		.trim()
		.min(1, 'Give the option a name.')
		.max(120, 'Keep the name under 120 characters.'),
	/** The case fee; null inherits the proposal's default. */
	fee_override: moneySchema.nullable(),
	/** The courtesy discount, as a percentage of the work. */
	discount_pct: percentSchema.nullable(),
	is_recommended: z.boolean(),
	financing_available: z.boolean(),
	billables: billableLineSchema.array(),
	products: productLineSchema.array()
});

const optionalEmail = z
	.string()
	.trim()
	.max(200, 'Keep the email under 200 characters.')
	.refine((value) => value === '' || z.email().safeParse(value).success, {
		error: 'Enter a valid email address.'
	});

const member = (what: string) => z.guid({ error: `Choose ${what} from the team.` });

export const proposalBuilderSchema = z
	.object({
		/** The contact the proposal is for — a patient, a homeowner. */
		contact_id: z.guid({ error: 'Choose who this is for.' }),
		/** The contact's details as shown; written back when changed. */
		contact_email: optionalEmail,
		contact_phone: z.string().trim().max(50, 'Keep the phone number under 50 characters.'),
		responsible_id: member('who is responsible'),
		presenter_id: member('who presents it'),
		notes: z.string().trim().max(2000, 'Keep the notes under 2000 characters.'),
		/** Which save button was pressed: open the new record, or go back to the list. */
		redirect_to: z.enum(['record', 'list']),
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
export type ProposalBuilderBillableLine = z.infer<typeof billableLineSchema>;
export type ProposalBuilderProductLine = z.infer<typeof productLineSchema>;

// ---------------------------------------------------------------------------
// What the builder picks from — the shapes the load ships and the parts read
// ---------------------------------------------------------------------------

/** A contact as the "for" picker offers it, with what section 1 prefills. */
export type BuilderContact = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
};

/** A member of the roster, as the two people pickers offer them. */
export type BuilderMember = { userId: string; name: string; email: string | null };

/** A billable as the builder needs it: enough to make a line and draw its units. */
export type BuilderBillable = {
	id: string;
	code: string | null;
	name: string;
	unit_price: number;
	currency: string;
	unit: string | null;
	unit_choices: string[] | null;
	is_featured: boolean;
};

/** A quick plan as the chips apply it: the billables it bundles, by id. */
export type BuilderQuickPlan = { id: string; name: string; billable_ids: string[] };

/** A product as the picker offers it; the line copies the price on pick. */
export type BuilderProduct = {
	id: string;
	name: string;
	sku: string | null;
	unit_price: number;
	currency: string;
	unit: string | null;
	category: string | null;
};

// ---------------------------------------------------------------------------
// Empty shapes
// ---------------------------------------------------------------------------

/** A billable line as picked: the schedule's price snapshotted, no units yet. */
export function billableLine(billable: BuilderBillable): ProposalBuilderBillableLine {
	return {
		billable_id: billable.id,
		label: billable.name,
		unit_cost: billable.unit_price,
		detail: '',
		not_applicable: false
	};
}

/** A product line as picked: one of it, at the catalog's price. */
export function productLine(product: BuilderProduct): ProposalBuilderProductLine {
	return {
		product_id: product.id,
		label: product.name,
		quantity: 1,
		unit_cost: product.unit_price
	};
}

/** An option with nothing on it yet; the first one is recommended by default. */
export function emptyOption(label: string, recommended = false): ProposalBuilderOption {
	return {
		label,
		fee_override: null,
		discount_pct: null,
		is_recommended: recommended,
		financing_available: true,
		billables: [],
		products: []
	};
}

/**
 * What the builder opens with: nobody chosen but the presenter (the signed-in
 * member, when they are one), one option, and the record page as the
 * destination.
 */
export function emptyProposal(presenterId: string | null = null): ProposalBuilder {
	return {
		contact_id: '',
		contact_email: '',
		contact_phone: '',
		responsible_id: '',
		presenter_id: presenterId ?? '',
		notes: '',
		redirect_to: 'record',
		options: [emptyOption('Option 1', true)]
	};
}
