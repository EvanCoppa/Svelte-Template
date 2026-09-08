import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { proposalEntityTypeSchema } from '$lib/schemas/proposals';
import type { CrmEntityRef } from './entity';
import { unwrap, unwrapDeleted } from './unwrap';

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
