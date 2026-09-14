import { tool } from 'ai';
import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';
import { RECORD_KIND_META } from '$lib/crm/records';
import { Constants } from '$lib/database.types';
import { TERM_IDS } from '$lib/features/vocabulary';
import { localDate } from '$lib/crm/ledger';
import { cellText } from '$lib/lists/cells';
import { LIST_KINDS, type ListRow, type ListSpec } from '$lib/lists/types';
import { listRecords as readRecords, type ListResult } from '$lib/server/crm/lists';
import { runView } from '$lib/server/crm/views';
import { loadList } from '$lib/server/lists';
import { companyFilterSchema, contactFilterSchema } from '$lib/views/filter';
import { isViewSource } from '$lib/views/types';
import { toolContextSchema } from '../context';
import { anyRecordAccess, recordAccess, requireToolContext } from './access';
import { recordKindSchema } from './record-ref';

/**
 * Offered while the caller may read any kind of record; each call re-checks
 * the one kind it names.
 */
export const listRecordsAccess = anyRecordAccess('read');

/** Rows the artifact draws at most; the model is told the true count. */
const MAX_ROWS = 200;

// The list a page draws, as zod — the same shapes `$lib/lists/types`
// declares, held to them by `satisfies` so a cell type added there is a
// type error here rather than a row the thread cannot validate.
const fieldLabelSchema = z.union([
	z.object({ text: z.string() }),
	z.object({ kind: recordKindSchema }),
	z.object({ term: z.enum(TERM_IDS) })
]);

const toneSchema = z.enum(BADGE_TONES);

const listFieldSchema = z.object({
	key: z.string(),
	label: fieldLabelSchema,
	type: z.enum([
		'text',
		'number',
		'money',
		'boolean',
		'date',
		'datetime',
		'enum',
		'record',
		'payment',
		'image'
	]),
	shown: z.boolean(),
	searchable: z.boolean(),
	filterable: z.boolean(),
	options: z
		.array(z.object({ value: z.string(), label: z.string(), tone: toneSchema.optional() }))
		.nullable(),
	custom: z
		.object({
			definitionId: z.string(),
			valueType: z.enum(Constants.public.Enums.custom_field_value_type)
		})
		.nullable()
});

const listSpecSchema = z.object({
	kind: z.enum(LIST_KINDS),
	fields: z.array(listFieldSchema)
}) satisfies z.ZodType<ListSpec>;

const listCellSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('link'), text: z.string(), href: z.string().nullable() }),
	z.object({ type: z.literal('status'), text: z.string(), tone: toneSchema }),
	z.object({ type: z.literal('record'), text: z.string(), href: z.string().nullable() }),
	z.object({ type: z.literal('text'), text: z.string() }),
	z.object({ type: z.literal('image'), url: z.string().nullable() }),
	z.object({ type: z.literal('number'), value: z.number().nullable() }),
	z.object({
		type: z.literal('money'),
		value: z.number().nullable(),
		currency: z.string(),
		unit: z.string().nullable()
	}),
	z.object({ type: z.literal('boolean'), value: z.boolean().nullable() }),
	z.object({ type: z.literal('date'), value: z.string().nullable() }),
	z.object({ type: z.literal('datetime'), value: z.string().nullable() }),
	z.object({
		type: z.literal('payment'),
		state: z.enum(Constants.public.Enums.payment_state).nullable(),
		dueDate: z.string().nullable(),
		owed: z.boolean()
	})
]);

const listRowSchema = z.object({
	id: z.string(),
	cells: z.array(listCellSchema)
}) satisfies z.ZodType<ListRow>;

/**
 * The filter the two party kinds accept — a view's own shape
 * (`$lib/views/filter`), so what the assistant composes here is exactly
 * what a saved view will store when per-org views arrive.
 */
const filterSchema = z
	.union([companyFilterSchema, contactFilterSchema])
	.describe(
		'Only for kind company or contact: which records, as a list of conditions that must all ' +
			'hold — { field, op, values | value } — plus an optional sort. Company fields: ' +
			'relationship / status (op in | not_in, values), name / email / website (op ilike, ' +
			'value), tag (op has, value). Contact fields: status, company_id (op in | not_in), ' +
			'has_company (op eq, value true | false), name / email / title (op ilike), ' +
			'company.relationship (op in | not_in), tag (op has). Sort: field name | status | ' +
			'created_at, direction asc | desc.'
	);

type AnyFilter = z.infer<typeof filterSchema>;

/** The filter as the kind's own schema reads it, or the reason it does not fit. */
function parseFilter<T>(schema: z.ZodType<T>, filter: AnyFilter, kind: string): T {
	const parsed = schema.safeParse(filter);
	if (parsed.success) return parsed.data;
	const reasons = parsed.error.issues.map((issue) => issue.message).join('; ');
	throw new Error(`That filter does not fit ${kind}: ${reasons}`);
}

export const listRecords = tool({
	description:
		'Show the user a list of records of one kind as a table they can search, filter and ' +
		'sort — the columns the organization’s own list page has. Use it whenever the answer ' +
		'is a set of records rather than a sentence about them ("show me every supplier", ' +
		'"which contacts have no company?"). For companies and contacts a filter narrows the ' +
		'list on the server; for every other kind the whole list is shown and the user ' +
		'filters in the table. The result is drawn for the user; you receive a compact copy ' +
		'with the ids.',
	inputSchema: z.object({
		kind: z
			.enum(LIST_KINDS)
			.describe('The kind of record to list. The session context lists which kinds exist here.'),
		filter: filterSchema.optional(),
		limit: z
			.number()
			.int()
			.min(1)
			.max(MAX_ROWS)
			.default(50)
			.describe('How many rows to draw at most.')
	}),
	outputSchema: z.object({
		kind: z.enum(LIST_KINDS),
		spec: listSpecSchema,
		rows: z.array(listRowSchema),
		total: z.number().int().describe('How many records matched, before the limit.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, filter, limit }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(kind, 'read'));

		let result: ListResult;
		if (filter && isViewSource(kind)) {
			// The union above accepted the shape; the kind decides which of the
			// two it has to be, and a condition the kind lacks is refused here.
			result =
				kind === 'company'
					? await runView(supabase, orgId, {
							source: kind,
							filter: parseFilter(companyFilterSchema, filter, kind)
						})
					: await runView(supabase, orgId, {
							source: kind,
							filter: parseFilter(contactFilterSchema, filter, kind)
						});
		} else {
			if (filter) throw new Error(`A filter applies to companies and contacts only, not ${kind}.`);
			result = await readRecords(supabase, orgId, kind);
		}

		const { list } = await loadList(
			{ supabase, org, activeOrgId: orgId },
			RECORD_KIND_META[kind].feature,
			result
		);
		return {
			kind,
			spec: list.spec,
			rows: list.rows.slice(0, limit),
			total: list.rows.length
		};
	},
	/**
	 * What the model reads: the ids and the visible cells as text, not the
	 * typed cells the page draws — a list of two hundred rows is an artifact
	 * for the reader, and a few thousand tokens of cell metadata for nobody.
	 */
	toModelOutput: ({ output }) => {
		const today = localDate(new Date());
		const shown = output.spec.fields.flatMap((field, index) =>
			field.shown ? [{ key: field.key, index }] : []
		);
		return {
			type: 'json',
			value: {
				kind: output.kind,
				total: output.total,
				shown: output.rows.length,
				columns: shown.map((column) => column.key),
				rows: output.rows.map((row) => ({
					id: row.id,
					cells: shown.map((column) => {
						const cell = row.cells[column.index];
						return cell ? cellText(cell, today) : '';
					})
				}))
			}
		};
	}
});
