import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { memberName } from '$lib/components/staff/member.js';
import { RECORD_KIND_META } from '$lib/crm/records';
import { QUERY } from '$lib/queries';
import { listDeals, moveDeal } from '$lib/server/crm/deals';
import { listPipelines } from '$lib/server/crm/pipelines';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { loadList } from '$lib/server/lists';
import { can, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import { moveDealSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The deals page: the same rows drawn as a funnel or as a table, and the one
 * write a card offers in place — moving it to another stage. Everything else
 * about a deal is the record page's.
 *
 * Gated by the hook on the `deals` feature + read grant; see companies. The two
 * views are a device preference and never reach the server, so both the table's
 * rows (`loadRecordList`, the list's fields as the industry has them) and the
 * board's are read either way: which view is on screen changes nothing about
 * what the page is showing.
 */

/** The explicit form id, shared by the load, the action and the page's `superForm`. */
const MOVE_FORM_ID = 'move-deal';

export const load: PageServerLoad = async ({ locals, depends, url }) => {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.deals);

	// Whether the board is live or a picture of one: without `manage` the cards
	// are read-only, so the page freezes it rather than offering a drag that
	// would come back a 403.
	const canMove = can(org.access, 'deals', 'manage');

	const [deals, pipelines, staff] = await Promise.all([
		// The rows, read ONCE and used twice: the table wants them described for
		// the list's fields (`loadList` below, the seam a view already goes
		// through), the board wants the columns themselves — a deal's amount, its
		// close date, the outcome of the stage it is in.
		listDeals(locals.supabase, activeOrgId),
		// The board's columns: a funnel is `pipeline_stages` rows, because a
		// practice and a roofer do not run the same one (the pipelines migration).
		listPipelines(locals.supabase, activeOrgId),
		// The names behind the assignee on a card. Any member may read the roster's
		// profiles, so this needs no `staff` grant of its own.
		listStaff(locals.supabase, activeOrgId)
	]);
	const list = await loadList(locals, RECORD_KIND_META.deal.feature, { kind: 'deal', rows: deals });

	// Only what a column needs to be drawn and to take a card, in the order the
	// board shows them — a stage's probability is the ring's fill.
	const boards = pipelines.map((pipeline) => ({
		id: pipeline.id,
		name: pipeline.name,
		stages: pipeline.pipeline_stages.map((stage) => ({
			id: stage.id,
			name: stage.name,
			outcome: stage.outcome,
			probability: stage.probability,
			// Carried so that a card held optimistically in a stage it has just been
			// dropped on describes that stage whole, rather than wearing the position
			// of the one it left.
			sortOrder: stage.sort_order
		}))
	}));

	/**
	 * Which funnel is on screen. A stage only means something inside its own
	 * board, so a funnel draws one board at a time — and the query string is
	 * where that choice lives, the way the ledger's account filter does, so a
	 * link to a particular funnel is a link to that funnel. Resolved here
	 * rather than trusted: an id that is not this org's falls back to the
	 * default board.
	 */
	const wanted = url.searchParams.get('board');
	// `boards` is a 1:1 map of `pipelines`, so the default board's index is its
	// own; -1 (no default, which the organizations trigger makes impossible)
	// reads as undefined and falls through to the first.
	const isDefault = pipelines.findIndex((pipeline) => pipeline.is_default);
	const shown =
		boards.find((candidate) => candidate.id === wanted) ?? boards[isDefault] ?? boards.at(0);

	return {
		...list,
		deals,
		pipelines: boards,
		boardId: shown?.id ?? null,
		// Named here the way the roster names a member, so a card and the staff
		// page call the same person the same thing — and named only: a card has
		// no use for a roster row's roles, email or avatar.
		members: staff.map((member) => ({ userId: member.userId, name: memberName(member) })),
		canMove,
		moveForm: await superValidate(zod4(moveDealSchema), { id: MOVE_FORM_ID }),
		...(await loadCreateRecord(locals, 'deal'))
	};
};

export const actions: Actions = {
	// Creating goes through the generic record form ($lib/server/records.ts), which
	// opens with requirePermission(locals.org.access, 'deals', 'manage').
	create: (event) => createRecord(event, 'deal'),

	/**
	 * A card was dropped on another stage, or carried there with the arrow keys.
	 * One action for both, because they are one act: the deal is in a different
	 * stage than it was — which is how a deal moves down the funnel.
	 */
	move: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'deals', 'manage');

		const form = await superValidate(request, zod4(moveDealSchema), { id: MOVE_FORM_ID });
		if (!form.valid) return fail(400, { form });

		try {
			// The board comes with the stage: `moveDeal` looks the pair up, which
			// is also what proves the stage is this org's.
			await moveDeal(locals.supabase, activeOrgId, form.data.id, form.data.stage_id);
		} catch (cause) {
			// What went wrong, in the database's words when it had any.
			return message(form, cause instanceof Error ? cause.message : 'Could not move the deal.', {
				status: 400
			});
		}
		return { form };
	}
};
