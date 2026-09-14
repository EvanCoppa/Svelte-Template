import { redirect } from '@sveltejs/kit';
import { graphNodeId } from '$lib/crm/graph';
import { passesFeatureGate } from '$lib/features/gate';
import { visibleTerms } from '$lib/features/terms';
import { mapConfig } from '$lib/map';
import { QUERY } from '$lib/queries';
import { listDeals } from '$lib/server/crm/deals';
import { describeGraph } from '$lib/server/crm/graph';
import { readLedger } from '$lib/server/crm/ledger';
import { pinsFor } from '$lib/server/crm/views';
import { loadVocabulary } from '$lib/server/features';
import { loadRecordPage, recordGate, recordPageActions } from '$lib/server/record-page';
import type { Actions, PageServerLoad } from './$types';

/**
 * One company — a page of its own rather than the generic record page.
 *
 * A static segment outranks `[kind=record]`, so this takes over
 * `/companies/<id>` and the generic page stays the default for every other
 * kind (the rule in `$lib/crm/records`). Sitting under `/companies` is what
 * gates it: the hook already decided whether this session may open anything
 * under that prefix, so there is no check here either.
 *
 * It earns the specific page because a company is the CRM's root party —
 * the thing people, deals, invoices, tickets and orders all hang off — so
 * the three fields the generic page can draw for it say almost nothing. What
 * a reader actually comes here to learn is who works there, what is owed,
 * where it is, and how it is connected; the first three are figures the
 * generic page has no frame for, and the fourth is the relationship graph,
 * which is a tab of its own here rather than a card at the foot of Overview.
 *
 * Everything a record page has — the header, the tabs, the rail, the
 * addresses, the notes, the conversation, the generic edit form — is
 * `$lib/server/record-page.ts`, composed rather than copied, so this page and
 * the generic one can never drift on what a record page shows.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const { features } = org;
	const { canRead, canOpen } = recordGate(org);

	// The account's rows change when an invoice is issued or a payment lands,
	// wherever that happened — the same key `/ledger` depends on.
	const ledgerShown = passesFeatureGate('/ledger', features, canRead);
	if (ledgerShown) depends(QUERY.ledger);

	const graphShown = passesFeatureGate('/graph', features, canRead);
	const dealsShown = canOpen('deal');

	const [shell, deals, ledger, graph] = await Promise.all([
		loadRecordPage(locals, 'company', params.id, depends),
		// The figures at the top need the amounts and the stage each deal sits
		// in, which a related-records row does not carry — one read of the same
		// rows `listRelatedRecords()` lists, for the numbers rather than the list.
		dealsShown ? listDeals(supabase, activeOrgId, { companyId: params.id }) : [],
		// A company is a ledger account (`accountSideOf()`), so this is the
		// account's own statement — the same rows `/ledger` shows, filtered to
		// it. Summed in the browser, because "overdue" is a wall-clock word.
		ledgerShown ? readLedger(supabase, activeOrgId, { companyId: params.id }, canOpen) : null,
		// The whole map, narrowed to this record's neighbourhood in the page by
		// `egoGraph()`. The vocabulary is read again here rather than threaded
		// out of the shell: it is a lookup table, and the two reads run
		// together instead of one waiting on the other.
		graphShown
			? loadVocabulary(supabase, org.activeOrg.industryId).then((vocabulary) =>
					describeGraph(supabase, activeOrgId, canOpen, vocabulary, visibleTerms(features, canRead))
				)
			: null
	]);

	return {
		...shell,
		// The deal figures the strip adds up — only what a stage still open
		// holds is pipeline; what a closed one holds is history.
		deals: deals.map((deal) => ({
			id: deal.id,
			amount: deal.amount,
			outcome: deal.pipeline_stages.outcome
		})),
		ledger,
		graph,
		/** Where this company sits on the map — the same pins a view draws. */
		pins: pinsFor(
			{ kind: 'company', rows: [{ id: shell.record.id, name: shell.record.name }] },
			canOpen,
			shell.addresses
		),
		// Null when there is no map configured; the Addresses tab says so.
		map: mapConfig(),
		/** The node the graph opens on — this company. */
		focus: graphNodeId('company', params.id),
		canOpenContacts: canOpen('contact')
	};
};

/**
 * The same actions every record page has: the company's own fields through
 * the generic form, its addresses and its relationships. A company has no
 * photos and no conversation, and the actions for those refuse the kind
 * before they touch the database.
 */
export const actions: Actions = recordPageActions(() => 'company');
