import { parseDayKey, relativeDayLabel, startOfDay } from '$lib/calendar';
import type { KanbanRingFill, KanbanStatus } from '$lib/components/kanban/index.js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { STAGE_OUTCOME_TONE } from '$lib/crm/tones';
import type { Tables } from '$lib/database.types';

/**
 * What a deal IS to the browser: which column of the board it sits in, how far
 * along that column is, what the column adds up to, and how its expected close
 * date reads. Pure on purpose, like `$lib/crm/tasks.ts` — the board asks these
 * questions and should not answer them itself.
 *
 * The board's columns are **rows, not an enum**: a dental practice and a roofer
 * do not run the same funnel, so a column is built from `pipeline_stages` rows.
 * An open stage IS the state a deal is in and gets its own column, the same
 * one-status-one-column rule the funnel has always followed — but every stage
 * that closes the deal shares one `Closed` column, grouped and split into drop
 * zones the way the task board's grouped columns are (`buildDealColumns()`
 * below), so scanning who is won and who is lost does not cost the funnel a
 * column per terminal stage.
 *
 * Every Date here is local, the rule `$lib/calendar.ts` sets: "slipping" is a
 * wall-clock word, so it is worked out in the reader's own zone rather than in
 * whichever zone the server happens to sit in.
 */

/** A stage as a column needs it — never the whole row. */
export type StageLike = Pick<Tables<'pipeline_stages'>, 'outcome' | 'probability'>;

/**
 * A stage as the board's columns are built from — enough to name and tone it,
 * plus which column it shares with other OPEN stages, if any
 * (`pipeline_stage_groups` — the deal board's `TASK_STATUS_GROUPS`, as rows).
 * `groupLabel` is present exactly when `groupId` is; a null group draws the
 * stage as a column of its own, same as every stage has always had.
 */
export type StageColumn = Pick<
	Tables<'pipeline_stages'>,
	'id' | 'name' | 'outcome' | 'probability'
> & {
	groupId: string | null;
	groupLabel: string | null;
};

/** One status inside a column, with the hue and ring its own drop zone draws. */
export type DealColumnStatus = KanbanStatus & { tone: BadgeTone; fill: KanbanRingFill };

/** One column of the funnel — an open stage on its own, or every closed one together. */
export type DealColumn = {
	/** Names the column to the board. A stage's own id for an open stage. */
	id: string;
	label: string;
	tone: BadgeTone;
	fill: KanbanRingFill;
	statuses: readonly DealColumnStatus[];
};

/** The one column every closed stage shares, whatever an org calls its stages. */
const CLOSED_COLUMN_ID = 'closed';

/** One stage, as the status a column's drop zone draws. */
function statusOf(stage: StageColumn): DealColumnStatus {
	return {
		value: stage.id,
		label: stage.name,
		tone: STAGE_OUTCOME_TONE[stage.outcome],
		fill: stageFill(stage)
	};
}

/**
 * The funnel's columns, built from one board's stages. Two groupings apply,
 * and they answer different questions:
 *
 *  - Every stage whose outcome closes the deal (won, lost, and any more an
 *    org adds) is folded into one `Closed` column, split into a drop zone per
 *    stage — outcome is the only thing that matters there, so the funnel is
 *    the same width regardless of how many terminal stages an org defines.
 *  - Among the OPEN stages, one carrying the same `groupId` as another shares
 *    ITS column too (`pipeline_stage_groups` — the same `Kanban.Zones`
 *    grouped-column pattern the task board uses, as rows rather than a JS
 *    constant because a pipeline's stages are rows). An ungrouped open stage
 *    is a column of its own, exactly as every stage has always been — a board
 *    nobody has grouped renders exactly as it did before this existed.
 *
 * Column order follows `stages`' own order (sort_order): a group's column
 * takes the position of its first member.
 */
export function buildDealColumns(stages: readonly StageColumn[]): DealColumn[] {
	const open = stages.filter((stage) => stage.outcome === 'open');
	const closed = stages.filter((stage) => stage.outcome !== 'open');

	const columns: DealColumn[] = [];
	const groupsSeen = new Set<string>();

	for (const stage of open) {
		if (stage.groupId === null) {
			columns.push({
				id: stage.id,
				label: stage.name,
				tone: STAGE_OUTCOME_TONE[stage.outcome],
				fill: stageFill(stage),
				statuses: [statusOf(stage)]
			});
			continue;
		}
		if (groupsSeen.has(stage.groupId)) continue;
		groupsSeen.add(stage.groupId);

		const members = open.filter((candidate) => candidate.groupId === stage.groupId);
		const [first] = members;
		columns.push({
			id: stage.groupId,
			label: stage.groupLabel ?? first.name,
			tone: STAGE_OUTCOME_TONE[first.outcome],
			fill: stageFill(first),
			statuses: members.map(statusOf)
		});
	}

	if (closed.length > 0) {
		const [first] = closed;
		columns.push({
			id: CLOSED_COLUMN_ID,
			label: 'Closed',
			tone: STAGE_OUTCOME_TONE[first.outcome],
			fill: stageFill(first),
			statuses: closed.map(statusOf)
		});
	}

	return columns;
}

/**
 * A deal as any of these functions needs it, with the stage it sits in. The
 * stage is narrower here than `StageLike` on purpose: what a card asks of its
 * stage is how the deal ENDED, and the row carries only that much of it
 * (`listDeals`'s join), while the forecast weight is the column's business.
 */
export type DealLike = Pick<Tables<'deals'>, 'expected_close_date'> & {
	pipeline_stages: Pick<Tables<'pipeline_stages'>, 'outcome'>;
};

/**
 * One board's deals in their columns, every column present so the page renders
 * a stable set of them — an empty stage is part of the funnel's shape and says
 * something about it. Deals on another board are left out: a stage only means
 * something inside its own pipeline, so a card can only be in one board's
 * columns.
 */
export function groupDealsByStage<T extends Pick<Tables<'deals'>, 'stage_id'>>(
	deals: readonly T[],
	stageIds: readonly string[]
): Record<string, T[]> {
	// SAFETY: built by mapping `stageIds`, so every column the caller named has
	// an entry before a deal is placed in one — the same construction, and the
	// same reason, as `groupTasksByStatus`.
	const columns = Object.fromEntries(stageIds.map((id) => [id, [] as T[]])) as Record<string, T[]>;
	for (const deal of deals) columns[deal.stage_id]?.push(deal);
	return columns;
}

/**
 * How full a stage's ring is drawn. An open stage is as far along as it says it
 * is likely to close — which is what `probability` is for (the pipelines
 * migration: "`probability` weights the forecast") — so the rings fill up
 * across the funnel instead of repeating the column's own colour. The two ends
 * are the words a fraction cannot say: won is done, and lost is stopped.
 */
export function stageFill(stage: StageLike): KanbanRingFill {
	if (stage.outcome === 'won') return 'done';
	if (stage.outcome === 'lost') return 'stopped';
	return stage.probability === null ? 'empty' : stage.probability / 100;
}

/** What a column is worth: its deals' amounts, with a figureless one counting nothing. */
export function stageTotal(deals: readonly Pick<Tables<'deals'>, 'amount'>[]): number {
	return deals.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
}

/**
 * When a deal is expected to close, worded by the same `relativeDayLabel()` a
 * task's due date reads through. The column is a `date`, so it is read as a
 * local day rather than an instant — otherwise a deal closing on the 20th
 * reads as the 19th west of Greenwich. Null when no date is set: the card says
 * nothing rather than "—".
 */
export function closeLabel(deal: DealLike, now: Date): string | null {
	const day = parseDayKey(deal.expected_close_date);
	return day === null ? null : relativeDayLabel(day, now);
}

/**
 * True when a deal is past the day it was meant to close and is still open —
 * the one thing a card says in red. A won or lost deal is not late, it is
 * finished, however long ago the date was.
 */
export function dealIsSlipping(deal: DealLike, now: Date): boolean {
	if (deal.pipeline_stages.outcome !== 'open') return false;
	const day = parseDayKey(deal.expected_close_date);
	return day !== null && day.getTime() < startOfDay(now).getTime();
}
