import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/database.types';
import type { Vocabulary } from '$lib/features/vocabulary';
import { slideDeckSchema } from '$lib/schemas/decks';
import { getDisplayNames } from '$lib/server/profiles';
import { defaultDeck } from '$lib/slides/default-deck';
import type { Presentation, PresentationOption, SlideDeck } from '$lib/slides/types';
import { type CustomField, listCustomFields } from './custom-fields';
import { listProducts } from './products';
import { getProposal } from './proposals';
import { resolveProposalParent } from './records';
import { ensure, unwrap } from './unwrap';

/**
 * Data access for slides — the two things the slides layer needs from the
 * database, and nothing else in the app needs:
 *
 *   the org's deck   — `slide_decks`, one row per org; the built-in default
 *                      stands in until the org saves one (the org_slides
 *                      migration). Same contract as the other modules here:
 *                      request-scoped client + active org id.
 *   a presentation   — one proposal read and named for the slides:
 *                      its options with their lines and comparison rows, who
 *                      it is for, who presents it, in the industry's words —
 *                      and the org's active catalog, for the products slide.
 *
 * Both pages (`/proposals/slides`, `/proposals/[id]/present`) call these and
 * hand the results to `$lib/slides`; neither reads a table itself.
 */

export async function getDeck(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<SlideDeck> {
	const row = unwrap(
		await supabase.from('slide_decks').select('deck_json').eq('org_id', orgId).maybeSingle()
	);
	// A row that fails the schema (a shape from before a DECK_VERSION bump)
	// presents as the default rather than crashing every show.
	const parsed = row ? slideDeckSchema.safeParse(row.deck_json) : null;
	return parsed?.success ? parsed.data : defaultDeck();
}

/** The org's deck, whole — created on first save, replaced on every later one. */
export async function saveDeck(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string,
	deck: SlideDeck
): Promise<void> {
	ensure(
		await supabase
			.from('slide_decks')
			// `updated_by` has no default on update and the policy pins it to
			// the caller; `created_by` defaults to the caller on insert.
			.upsert({ org_id: orgId, deck_json: deck, updated_by: userId }, { onConflict: 'org_id' })
	);
}

/** What the presenter's page knows that the tables do not: the org's words. */
export type PresentationContext = {
	orgName: string;
	/** The proposal's noun as the industry says it — "quote", "treatment plan". */
	noun: string;
	vocabulary: Vocabulary;
};

type OptionRow = Tables<'proposal_options'> & {
	proposal_line_items: Tables<'proposal_line_items'>[];
};

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

function duration(option: OptionRow): string | null {
	if (option.duration_value === null || option.duration_unit === null) return null;
	const unit =
		option.duration_value === 1 ? option.duration_unit.replace(/s$/, '') : option.duration_unit;
	return `${String(option.duration_value)} ${unit}`;
}

function financing(option: OptionRow): string | null {
	if (!option.financing_available) return null;
	if (option.financing_term_months === null) return 'Financing available';
	const term = `${String(option.financing_term_months)} months`;
	return option.financing_apr === null ? term : `${term} at ${String(option.financing_apr)}% APR`;
}

/** A comparison row's value as a slide prints it; a dash when unset. */
function fieldText({ definition, value }: CustomField): string {
	if (!value) return '—';
	switch (definition.value_type) {
		case 'text':
		case 'select':
			return value.value_text ?? '—';
		case 'numeric':
			return value.value_numeric === null ? '—' : String(value.value_numeric);
		case 'boolean':
			return value.value_boolean === null ? '—' : value.value_boolean ? 'Yes' : 'No';
	}
}

function toOption(row: OptionRow, fields: CustomField[]): PresentationOption {
	return {
		id: row.id,
		label: row.label,
		recommended: row.is_recommended,
		// The trigger fills the total on every write; a null is a row it has not
		// reached yet, and reads as nothing owed rather than a broken slide.
		total: row.computed_total ?? 0,
		currency: row.currency,
		duration: duration(row),
		financing: financing(row),
		lines: [...row.proposal_line_items]
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((line) => ({
				label: line.label,
				detail: line.detail,
				quantity: line.quantity,
				unitCost: line.unit_cost,
				total: line.total ?? 0,
				productId: line.product_id
			})),
		fields: fields.map((field) => ({ label: field.definition.label, value: fieldText(field) }))
	};
}

/**
 * One proposal as the slides see it, or null when it does not exist in the
 * org (or RLS says so). The options come with their lines in one query;
 * each option's comparison rows come through the custom fields module.
 */
export async function loadPresentation(
	supabase: SupabaseClient<Database>,
	orgId: string,
	proposalId: string,
	context: PresentationContext
): Promise<Presentation | null> {
	const proposal = await getProposal(supabase, orgId, proposalId);
	if (!proposal) return null;

	const people = [proposal.presenter_id, proposal.responsible_id].filter(
		(id): id is string => id !== null
	);
	const [rows, parent, names, products] = await Promise.all([
		supabase
			.from('proposal_options')
			.select('*, proposal_line_items(*)')
			.eq('org_id', orgId)
			.eq('proposal_id', proposalId)
			.order('sort_order')
			.then(unwrap),
		resolveProposalParent(supabase, orgId, proposal),
		getDisplayNames(supabase, people),
		listProducts(supabase, orgId, { activeOnly: true })
	]);
	const fields = await Promise.all(
		rows.map((row) =>
			listCustomFields(supabase, orgId, { entityType: 'proposal_option', entityId: row.id })
		)
	);

	const person = (id: string | null) => {
		const name = id === null ? undefined : names.get(id);
		return name ? { name } : null;
	};

	return {
		org: { name: context.orgName },
		proposal: {
			id: proposal.id,
			title: proposal.title,
			noun: context.noun,
			date: date.format(new Date(proposal.created_at)),
			validUntil: proposal.valid_until ? date.format(new Date(proposal.valid_until)) : null
		},
		client: parent ? { name: parent.name } : null,
		presenter: person(proposal.presenter_id),
		responsible: person(proposal.responsible_id),
		labels: {
			presenter: context.vocabulary.proposal_presenter,
			responsible: context.vocabulary.proposal_responsible
		},
		options: rows.map((row, index) => toOption(row, fields[index] ?? [])),
		products: products.map((product) => ({
			id: product.id,
			sku: product.sku,
			name: product.name,
			description: product.description,
			price: product.unit_price,
			currency: product.currency
		}))
	};
}
