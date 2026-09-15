import { z } from 'zod';
import { Constants, type Enums } from '$lib/database.types';

/**
 * Proposal payloads at the application boundary, and the parsers for the
 * delimited strings the proposal slides consume.
 *
 * The database enforces every rule here a second time (docs/proposals.md:
 * enums, check constraints, the custom-field lookup table, triggers), so a
 * rule in this file buys a field-level message on the form, not the only
 * line of defence. What is deliberately NOT here: `computed_total` and the
 * line-item `total` — the server computes them, a payload never carries them.
 *
 * Shared by every route that edits a proposal or builds its slides, hence
 * `src/lib/schemas/` rather than a route-local `schema.ts`.
 */

export const proposalStatusSchema = z.enum(Constants.public.Enums.proposal_status);
/**
 * What a proposal hangs off. `crm_entity_type` is deliberately wider — it names
 * every record the shared polymorphic link can point at — and `proposals`
 * narrows it with a check constraint to these three. The `satisfies` keeps the
 * two in step: drop or rename one of these in the database and this stops
 * compiling instead of failing at insert time.
 */
const PROPOSAL_ENTITY_TYPES = [
	'company',
	'contact',
	'deal'
] as const satisfies readonly Enums<'crm_entity_type'>[];

export const proposalEntityTypeSchema = z.enum(PROPOSAL_ENTITY_TYPES);
export const durationUnitSchema = z.enum(Constants.public.Enums.duration_unit);

/** numeric(12, 2): the largest amount the money columns hold. */
export const MONEY_MAX = 9_999_999_999.99;

function hasAtMostTwoDecimals(value: number) {
	const cents = value * 100;
	return Math.abs(cents - Math.round(cents)) < 1e-6;
}

/** Money as stored: non-negative, cents precision, inside numeric(12, 2). */
export const moneySchema = z
	.number()
	.min(0, 'Cannot be negative.')
	.max(MONEY_MAX, 'Amount is too large.')
	.refine(hasAtMostTwoDecimals, 'Use at most two decimal places.');

/** A percentage as stored in numeric(5, 2): 8.25 means 8.25%. */
export const percentSchema = z
	.number()
	.min(0, 'Cannot be negative.')
	.max(100, 'Cannot exceed 100%.')
	.refine(hasAtMostTwoDecimals, 'Use at most two decimal places.');

/** The jsonb columns constrained to an object (base_config, custom_fields). */
const jsonObject = z.record(z.string(), z.json());

/**
 * Ids are validated with `z.guid()` rather than `z.uuid()` for the reason the
 * staff schema gives: seeded fixture ids do not carry RFC 4122 version bits.
 */

// ---------------------------------------------------------------------------
// proposals
// ---------------------------------------------------------------------------

type EntityLink = { entity_type?: string | null; entity_id?: string | null };

/** Both halves of the polymorphic parent link, or neither; unset reads as null. */
function entityLinkComplete(payload: EntityLink) {
	return ((payload.entity_type ?? null) === null) === ((payload.entity_id ?? null) === null);
}

/** For a partial edit: only judged when both halves are in the payload. */
function entityLinkCompleteIfSent(payload: EntityLink) {
	if (payload.entity_type === undefined || payload.entity_id === undefined) return true;
	return entityLinkComplete(payload);
}

const entityLinkIssue = {
	error: 'Choose both the kind of record and the record, or neither.',
	path: ['entity_id']
};

const proposalFields = z.object({
	entity_type: proposalEntityTypeSchema.nullable().optional(),
	entity_id: z.guid().nullable().optional(),
	title: z
		.string()
		.trim()
		.min(1, 'Give the proposal a title.')
		.max(200, 'Keep the title under 200 characters.'),
	base_config: jsonObject.optional(),
	status: proposalStatusSchema.optional(),
	default_fee: moneySchema.nullable().optional(),
	tax_rate: percentSchema.nullable().optional(),
	valid_until: z.iso.datetime({ offset: true }).nullable().optional()
});

/**
 * A new proposal. `org_id` and `created_by` come from the session, never the
 * form. Unset columns are left out of the payload rather than defaulted here:
 * the database owns the defaults, so an insert never overwrites them and a
 * partial update never resets them (`.partial()` keeps `.default()`).
 */
export const proposalInsertSchema = proposalFields.refine(entityLinkComplete, entityLinkIssue);

/**
 * A partial edit. Accepting is the one transition with a rule of its own:
 * it must say which option was accepted, exactly as the database insists.
 */
export const proposalUpdateSchema = proposalFields
	.partial()
	.extend({ selected_option_id: z.guid().nullable().optional() })
	.refine(entityLinkCompleteIfSent, entityLinkIssue)
	.refine(
		(payload) => payload.status !== 'accepted' || (payload.selected_option_id ?? null) !== null,
		{
			error: 'Accepting a proposal records which option was accepted.',
			path: ['selected_option_id']
		}
	);

// ---------------------------------------------------------------------------
// proposal_options
// ---------------------------------------------------------------------------

type Duration = { duration_value?: number | null; duration_unit?: string | null };

/** A duration is a value and a unit together, or nothing; unset reads as null. */
function durationComplete(payload: Duration) {
	return ((payload.duration_value ?? null) === null) === ((payload.duration_unit ?? null) === null);
}

/** For a partial edit: only judged when both halves are in the payload. */
function durationCompleteIfSent(payload: Duration) {
	if (payload.duration_value === undefined || payload.duration_unit === undefined) return true;
	return durationComplete(payload);
}

const durationIssue = {
	error: 'A duration needs both a number and a unit.',
	path: ['duration_unit']
};

const proposalOptionFields = z.object({
	label: z
		.string()
		.trim()
		.min(1, 'Give the option a label.')
		.max(120, 'Keep the label under 120 characters.'),
	sort_order: z.int().min(0).optional(),
	is_recommended: z.boolean().optional(),
	base_price: moneySchema.optional(),
	/** null inherits the proposal's default_fee. */
	fee_override: moneySchema.nullable().optional(),
	discount_amount: moneySchema.optional(),
	discount_pct: percentSchema.nullable().optional(),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, e.g. USD.')
		.optional(),
	duration_value: z.number().min(0, 'Cannot be negative.').nullable().optional(),
	duration_unit: durationUnitSchema.nullable().optional(),
	start_offset_days: z.int().min(0, 'Cannot be negative.').nullable().optional(),
	financing_available: z.boolean().optional(),
	financing_term_months: z.int().min(1, 'At least one month.').nullable().optional(),
	financing_apr: percentSchema.nullable().optional(),
	primary_image_url: z.url('Enter a full URL.').nullable().optional(),
	custom_fields: jsonObject.optional()
});

/** A new option for an existing proposal. `org_id` comes from the session. */
export const proposalOptionInsertSchema = proposalOptionFields
	.extend({ proposal_id: z.guid() })
	.refine(durationComplete, durationIssue);

/** A partial edit; an option never moves to another proposal. */
export const proposalOptionUpdateSchema = proposalOptionFields
	.partial()
	.refine(durationCompleteIfSent, durationIssue);

/** One line inside an option. `total` is generated by the database. */
export const proposalLineItemSchema = z.object({
	label: z
		.string()
		.trim()
		.min(1, 'Give the line a label.')
		.max(200, 'Keep the label under 200 characters.'),
	quantity: z.number().min(0, 'Cannot be negative.').optional(),
	unit_cost: moneySchema.optional(),
	sort_order: z.int().min(0).optional()
});
