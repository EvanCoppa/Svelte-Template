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

/** The columns the migration lets a member set on an option at insert. */
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

/** The columns a member sets on a line at insert; `total` is generated. */
type ProposalLineItemColumn = 'product_id' | 'label' | 'quantity' | 'unit_cost' | 'sort_order';

export type ProposalOptionInsert = Pick<TablesInsert<'proposal_options'>, ProposalOptionColumn>;
export type ProposalLineItemInsert = Pick<
	TablesInsert<'proposal_line_items'>,
	ProposalLineItemColumn
>;

/**
 * An option with its lines, as the builder posts them. Sort orders are not
 * in the payload: an option's is its position among the options, a line's
 * its position within the option, and this module assigns both.
 */
export type ProposalOptionDraft = {
	option: Omit<ProposalOptionInsert, 'sort_order'>;
	line_items: Omit<ProposalLineItemInsert, 'sort_order'>[];
};

/**
 * Creates a proposal together with its options and their lines — what the
 * builder page posts in one go. Three inserts, one per table, each batched:
 * the proposal, then every option in one statement, then every line in one.
 *
 * PostgREST offers no transaction across them. A refusal part-way (a check
 * constraint the form did not mirror, a policy) leaves what was written — a
 * draft with fewer options than asked for — and throws the message; the
 * form shows it, and the draft is on the list to open or delete.
 */
export async function createProposalWithOptions(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'proposals'>, ProposalColumn>,
	options: readonly ProposalOptionDraft[]
): Promise<Proposal> {
	const proposal = await createProposal(supabase, orgId, values);

	const optionRows = unwrap(
		await supabase
			.from('proposal_options')
			.insert(
				options.map(({ option }, index) => ({
					...option,
					org_id: orgId,
					proposal_id: proposal.id,
					sort_order: index
				}))
			)
			.select('id, sort_order')
	);

	// Lines join their option by the sort order this call assigned, not by
	// the order rows came back in — the one key both sides are sure of.
	const lines = options.flatMap(({ line_items }, index) => {
		const optionId = optionRows.find((row) => row.sort_order === index)?.id;
		if (optionId === undefined) {
			throw new Error(`Option ${String(index + 1)} was not created.`);
		}
		return line_items.map((line, position) => ({
			...line,
			org_id: orgId,
			proposal_option_id: optionId,
			sort_order: position
		}));
	});
	if (lines.length > 0) ensure(await supabase.from('proposal_line_items').insert(lines));

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
