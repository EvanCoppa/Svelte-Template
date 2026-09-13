import { describe, expect, it } from 'vitest';
import {
	closeLabel,
	dealIsSlipping,
	groupDealsByStage,
	stageFill,
	stageTotal,
	type DealLike,
	type StageLike
} from './deals';

/**
 * Local noon on a Tuesday, so every case below is a whole number of days from
 * "today" whichever zone the suite runs in — the bug these functions exist to
 * avoid is a deal reading as slipping because the server is in Sydney.
 */
const NOW = new Date(2026, 8, 15, 12, 0, 0);

const open: StageLike = { outcome: 'open', probability: 40 };

/** A deal closing `days` from NOW, in the `date` column's own format. */
function closing(days: number, stage: StageLike = open): DealLike {
	const day = new Date(2026, 8, 15 + days);
	const key = `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
	return { expected_close_date: key, pipeline_stages: stage };
}

describe('the funnel’s columns', () => {
	it('puts every deal under its stage, and keeps empty stages as columns', () => {
		const deals = [
			{ id: 'a', stage_id: 'lead' },
			{ id: 'b', stage_id: 'won' },
			{ id: 'c', stage_id: 'lead' }
		];

		const columns = groupDealsByStage(deals, ['lead', 'proposal', 'won']);
		expect(Object.keys(columns)).toEqual(['lead', 'proposal', 'won']);
		expect(columns.lead.map((deal) => deal.id)).toEqual(['a', 'c']);
		// An empty stage is part of the funnel's shape and says something about it.
		expect(columns.proposal).toEqual([]);
	});

	it('leaves out a deal on another board rather than inventing a column', () => {
		const columns = groupDealsByStage([{ stage_id: 'elsewhere' }], ['lead']);
		expect(columns).toEqual({ lead: [] });
	});

	it('adds a column up, counting a deal with no figure as nothing', () => {
		expect(stageTotal([{ amount: 12000 }, { amount: null }, { amount: 500 }])).toBe(12500);
		expect(stageTotal([])).toBe(0);
	});
});

describe('how full a stage’s ring is', () => {
	it('reads an open stage’s probability as the fraction it is', () => {
		expect(stageFill({ outcome: 'open', probability: 25 })).toBe(0.25);
		expect(stageFill({ outcome: 'open', probability: 100 })).toBe(1);
	});

	it('draws an unweighted stage empty rather than guessing at it', () => {
		expect(stageFill({ outcome: 'open', probability: null })).toBe('empty');
	});

	it('says the two ends in words, whatever the probability on them', () => {
		expect(stageFill({ outcome: 'won', probability: 90 })).toBe('done');
		expect(stageFill({ outcome: 'lost', probability: 10 })).toBe('stopped');
	});
});

describe('when a deal is expected to close', () => {
	it('names the days near today rather than dating them', () => {
		expect(closeLabel(closing(0), NOW)).toBe('Today');
		expect(closeLabel(closing(1), NOW)).toBe('Tomorrow');
		expect(closeLabel(closing(-1), NOW)).toBe('Yesterday');
		expect(closeLabel(closing(-4), NOW)).toBe('4 days ago');
	});

	it('reads the column as the day it names, not as an instant', () => {
		// Midnight UTC on the 20th is the 19th west of Greenwich; the label must
		// be the day the column says whichever zone the reader is in.
		expect(closeLabel({ expected_close_date: '2026-09-20', pipeline_stages: open }, NOW)).toBe(
			'Sunday'
		);
	});

	it('says nothing at all when no date is set', () => {
		expect(closeLabel({ expected_close_date: null, pipeline_stages: open }, NOW)).toBeNull();
	});
});

describe('which deals are slipping', () => {
	it('is past the day it was meant to close, and still open', () => {
		expect(dealIsSlipping(closing(-1), NOW)).toBe(true);
		// Today is not late: the comparison is between days, which is what "due
		// today" means.
		expect(dealIsSlipping(closing(0), NOW)).toBe(false);
		expect(dealIsSlipping(closing(1), NOW)).toBe(false);
	});

	it('is never a closed deal, however long ago the date was', () => {
		expect(dealIsSlipping(closing(-30, { outcome: 'won', probability: 100 }), NOW)).toBe(false);
		expect(dealIsSlipping(closing(-30, { outcome: 'lost', probability: 0 }), NOW)).toBe(false);
	});

	it('is never a deal with no date to miss', () => {
		expect(dealIsSlipping({ expected_close_date: null, pipeline_stages: open }, NOW)).toBe(false);
	});
});
