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

// ---------------------------------------------------------------------------
// The delimited strings the proposal slides consume
// ---------------------------------------------------------------------------
//
// Two slide templates take their content as newline-separated lines of
// "|"-separated cells — the comparison table (options across the top,
// one row per attribute) and the investment summary ("label|amount" lines).
// A form action validates the string with the schemas below and keeps the
// PARSED shape: cell counts line up with the header, numbers are numbers,
// and the flags a template draws as icons come from a known set — so the
// template never meets a string it has to guess at.

/** Cells are separated by this within a line. */
export const CELL_DELIMITER = '|';
/** A header cell ending in this marks the recommended column. */
export const RECOMMENDED_MARK = '*';
/** Body cells the comparison slide draws as a check mark instead of text. */
export const YES_CELLS = ['yes', 'y', 'true', '✓', 'check', 'included'] as const;
/** Body cells the comparison slide draws as a cross instead of text. */
export const NO_CELLS = ['no', 'n', 'false', '✗', 'x', '-', '—'] as const;

export type ComparisonCell =
	| { kind: 'yes' }
	| { kind: 'no' }
	| { kind: 'number'; value: number; text: string }
	| { kind: 'text'; text: string };

export type ComparisonTable = {
	/** The heading over the row labels — usually "Feature", often blank. */
	heading: string;
	/** One per option, in slide order. At most one is recommended. */
	columns: { label: string; recommended: boolean }[];
	/**
	 * One per attribute. A numeric row (any cell parsed as a number) holds
	 * only numbers, yes/no marks and blanks, so it can be compared.
	 */
	rows: { label: string; numeric: boolean; cells: ComparisonCell[] }[];
};

export type InvestmentLineItem = { label: string; amount: number };

function splitLines(raw: string) {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function splitCells(line: string) {
	return line.split(CELL_DELIMITER).map((cell) => cell.trim());
}

const NUMERIC_CELL = /^[-+]?[$€£]?\s*\d[\d,]*(?:\.\d+)?\s*%?$/;

/** Tolerant number parse: "$4,500.00" → 4500, "12%" → 12; anything else is null. */
export function parseNumericCell(raw: string): number | null {
	const text = raw.trim();
	if (!NUMERIC_CELL.test(text)) return null;
	const value = Number(text.replace(/[^0-9.-]/g, ''));
	return Number.isFinite(value) ? value : null;
}

const YES_SET: ReadonlySet<string> = new Set(YES_CELLS);
const NO_SET: ReadonlySet<string> = new Set(NO_CELLS);

function toCell(raw: string): ComparisonCell {
	const key = raw.toLowerCase();
	if (YES_SET.has(key)) return { kind: 'yes' };
	if (NO_SET.has(key)) return { kind: 'no' };
	const value = parseNumericCell(raw);
	if (value !== null) return { kind: 'number', value, text: raw };
	return { kind: 'text', text: raw };
}

/**
 * The comparison-table slide's `table` string, parsed. The first line is the
 * header (row-label heading, then one cell per option, `*` suffix on the
 * recommended one); every later line is one attribute row with exactly as
 * many cells as the header.
 */
export const comparisonTableSchema = z.string().transform((raw, ctx): ComparisonTable => {
	const problems: string[] = [];
	const lines = splitLines(raw);
	const headerLine = lines[0];

	if (headerLine === undefined || lines.length < 2) {
		ctx.addIssue({ code: 'custom', message: 'Needs a header line and at least one row.' });
		return z.NEVER;
	}

	const header = splitCells(headerLine);
	const heading = header[0] ?? '';
	const columns = header.slice(1).map((cell, index) => {
		const recommended = cell.endsWith(RECOMMENDED_MARK);
		const label = recommended ? cell.slice(0, -RECOMMENDED_MARK.length).trim() : cell;
		if (label.length === 0) problems.push(`Header: option ${String(index + 1)} has no label.`);
		return { label, recommended };
	});

	if (columns.length === 0)
		problems.push('Header: add at least one option column after the row-label heading.');
	if (columns.filter((column) => column.recommended).length > 1) {
		problems.push(`Header: only one column can end in "${RECOMMENDED_MARK}" (recommended).`);
	}

	const rows = lines.slice(1).map((line, index) => {
		const lineNumber = index + 2;
		const cells = splitCells(line);
		if (cells.length !== header.length) {
			problems.push(
				`Line ${String(lineNumber)}: ${String(cells.length)} cells, the header has ${String(header.length)}.`
			);
		}
		const label = cells[0] ?? '';
		if (label.length === 0) problems.push(`Line ${String(lineNumber)}: the row has no label.`);

		const parsed = cells.slice(1).map(toCell);
		const numeric = parsed.some((cell) => cell.kind === 'number');
		if (numeric) {
			for (const cell of parsed) {
				if (cell.kind === 'text' && cell.text.length > 0) {
					problems.push(
						`Line ${String(lineNumber)}: "${cell.text}" is not a number, but the row is numeric.`
					);
				}
			}
		}
		return { label, numeric, cells: parsed };
	});

	if (problems.length > 0) {
		for (const message of problems) ctx.addIssue({ code: 'custom', message });
		return z.NEVER;
	}

	return { heading, columns, rows };
});

/**
 * The investment-summary slide's `lineItems` string, parsed: one
 * "label|amount" per line, amount parsed as money (currency symbols and
 * thousands separators tolerated). Blank input is an empty list.
 */
export const investmentLineItemsSchema = z.string().transform((raw, ctx): InvestmentLineItem[] => {
	const problems: string[] = [];
	const items = splitLines(raw).map((line, index) => {
		const lineNumber = index + 1;
		const cells = splitCells(line);
		if (cells.length !== 2) {
			problems.push(
				`Line ${String(lineNumber)}: expected "label|amount", found ${String(cells.length)} cells.`
			);
		}
		const label = cells[0] ?? '';
		if (label.length === 0) problems.push(`Line ${String(lineNumber)}: the line has no label.`);
		const amount = parseNumericCell(cells[1] ?? '');
		if (amount === null) {
			problems.push(`Line ${String(lineNumber)}: "${cells[1] ?? ''}" is not an amount.`);
		}
		return { label, amount: amount ?? 0 };
	});

	if (problems.length > 0) {
		for (const message of problems) ctx.addIssue({ code: 'custom', message });
		return z.NEVER;
	}

	return items;
});
