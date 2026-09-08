import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { proposalEntityTypeSchema } from '$lib/schemas/proposals';
import type { CrmEntityRef } from './entity';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `proposals` — the decision every vertical shares
 * (docs/proposals.md). Same contract as deals.ts: request-scoped client +
 * active org id, write params Picked to the columns the migration grants,
 * `created_by` filled by the database, deletes gated to owner/admin by RLS
 * and verified by `unwrapDeleted`.
 *
 * A proposal hangs off one CRM record through the polymorphic link
 * (`entity_type` + `entity_id`), or off nothing at all — an unattached draft
 * is a legitimate row, and a deleted parent detaches rather than cascades.
 * The options are read with the proposal because everything a list or a
 * record page says about a proposal beyond its title is said by them.
 */

export type Proposal = Tables<'proposals'>;

/** What a list or a record page needs of an option: which, and its total. */
export type ProposalOptionSummary = Pick<
	Tables<'proposal_options'>,
	'id' | 'label' | 'sort_order' | 'is_recommended' | 'computed_total' | 'currency'
>;

export type ProposalWithOptions = Proposal & { proposal_options: ProposalOptionSummary[] };

// Two foreign keys run between the tables (an option's `proposal_id`, and a
// proposal's `selected_option_id`), so a bare embed is ambiguous to PostgREST
// (PGRST201) and would answer 500; naming the key says "the options OF this
// proposal" — the same fix org-context.ts applies to organization_members.
const SELECT =
	'*, proposal_options!proposal_options_proposal_id_org_id_fkey(id, label, sort_order, is_recommended, computed_total, currency)';

/** The columns the migration lets a member set on insert. */
type ProposalColumn =
	| 'entity_type'
	| 'entity_id'
	| 'title'
	| 'base_config'
	| 'status'
	| 'default_fee'
	| 'tax_rate'
	| 'valid_until'
	| 'deck_id';

/**
 * The kinds of record a proposal may hang off. `crm_entity_type` is wider —
 * every record the shared link can name — and the `proposals` migration
 * narrows it to these three; the schema in `$lib/schemas/proposals` is the
 * app-side statement of that, so this narrows through it rather than with a
 * cast.
 */
export type ProposalParentKind = Enums<'crm_entity_type'> & ('company' | 'contact' | 'deal');

export function proposalParentKind(
	value: Enums<'crm_entity_type'> | null
): ProposalParentKind | null {
	const parsed = proposalEntityTypeSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export async function listProposals(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: { entity?: CrmEntityRef; status?: Enums<'proposal_status'> } = {}
): Promise<ProposalWithOptions[]> {
	let query = supabase
		.from('proposals')
		.select(SELECT)
		.eq('org_id', orgId)
		.order('created_at', { ascending: false })
		.order('sort_order', { referencedTable: 'proposal_options' });
	if (filter.entity) {
		query = query
			.eq('entity_type', filter.entity.entityType)
			.eq('entity_id', filter.entity.entityId);
	}
	if (filter.status) query = query.eq('status', filter.status);
	return unwrap(await query);
}

export async function getProposal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	proposalId: string
): Promise<ProposalWithOptions | null> {
	return unwrap(
		await supabase
			.from('proposals')
			.select(SELECT)
			.eq('org_id', orgId)
			.eq('id', proposalId)
			.order('sort_order', { referencedTable: 'proposal_options' })
			.maybeSingle()
	);
}

export async function createProposal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'proposals'>, ProposalColumn>
): Promise<Proposal> {
	return unwrap(
		await supabase
			.from('proposals')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

/** The columns the migration lets a member set on an option. */
type ProposalOptionColumn =
	| 'label'
	| 'sort_order'
	| 'is_recommended'
	| 'base_price'
	| 'fee_override'
	| 'discount_amount'
	| 'discount_pct'
	| 'currency'
	| 'duration_value'
	| 'duration_unit'
	| 'start_offset_days'
	| 'financing_available'
	| 'financing_term_months'
	| 'financing_apr'
	| 'primary_image_url'
	| 'custom_fields';

/** The columns the migration lets a member set on a line. */
type ProposalLineItemColumn = 'label' | 'quantity' | 'unit_cost' | 'sort_order' | 'product_id';

export type ProposalLineItemInsert = Pick<
	TablesInsert<'proposal_line_items'>,
	ProposalLineItemColumn
>;

/** One option as the builder posts it: its own columns, and the lines inside it. */
export type ProposalOptionInsert = Pick<TablesInsert<'proposal_options'>, ProposalOptionColumn> & {
	line_items: ProposalLineItemInsert[];
};

/**
 * The builder's write: one proposal, its options and their lines, in that
 * order, because each child needs its parent's id. PostgREST has no
 * transaction, so a failure after the first insert leaves the proposal as a
 * draft with fewer options than were asked for — a legitimate row (the
 * migration allows an option-less proposal), reported to the caller as the
 * thrown message, and finishable from the record page.
 *
 * `sort_order` is the position in the array: what the builder lays out left
 * to right is the grid's column order.
 */
export async function createProposalWithOptions(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'proposals'>, ProposalColumn>,
	options: readonly ProposalOptionInsert[]
): Promise<Proposal> {
	const proposal = await createProposal(supabase, orgId, values);
	if (options.length === 0) return proposal;

	// An option's lines are not columns of its row — they wait for its id —
	// so each option is split into the row to insert now and the lines to
	// insert after.
	const split = options.map(({ line_items, ...columns }, index) => ({
		row: { ...columns, sort_order: index, org_id: orgId, proposal_id: proposal.id },
		lines: line_items
	}));

	const inserted = unwrap(
		await supabase
			.from('proposal_options')
			.insert(split.map((option) => option.row))
			.select('id, sort_order')
	);

	// The insert answers in no promised order; the position pins each row
	// back to the option it came from.
	const optionIds = new Map(inserted.map((row) => [row.sort_order, row.id]));
	const lines = split.flatMap((option, index) => {
		const proposalOptionId = optionIds.get(index);
		if (proposalOptionId === undefined) {
			throw new Error(`Option ${String(index + 1)} was not created.`);
		}
		return option.lines.map((line, position) => ({
			...line,
			sort_order: position,
			org_id: orgId,
			proposal_option_id: proposalOptionId
		}));
	});
	if (lines.length > 0) {
		ensure(await supabase.from('proposal_line_items').insert(lines));
	}

	return proposal;
}

export async function updateProposal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	proposalId: string,
	values: Pick<TablesUpdate<'proposals'>, ProposalColumn | 'selected_option_id'>
): Promise<Proposal> {
	return unwrap(
		await supabase
			.from('proposals')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', proposalId)
			.select()
			.single()
	);
}

export async function deleteProposal(
	supabase: SupabaseClient<Database>,
	orgId: string,
	proposalId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('proposals').delete().eq('org_id', orgId).eq('id', proposalId).select('id'),
		'Proposal'
	);
}
