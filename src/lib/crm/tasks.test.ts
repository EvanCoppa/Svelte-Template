import { describe, expect, it } from 'vitest';
import {
	dueLabel,
	groupTasksByBucket,
	groupTasksByStatus,
	TASK_BUCKETS,
	taskBucket,
	taskIsOverdue,
	type TaskLike
} from './tasks';
import { TASK_STATUSES } from './tones';

/**
 * Local noon on a Tuesday, so every case below is a whole number of days from
 * "today" whichever zone the suite runs in — the bug these functions exist to
 * avoid is a task landing in yesterday's pile because the server is in Sydney.
 */
const NOW = new Date(2026, 8, 15, 12, 0, 0);

/** A task due `days` from NOW, at 9am local. */
function due(days: number, status: TaskLike['status'] = 'todo'): TaskLike {
	const at = new Date(2026, 8, 15 + days, 9, 0, 0);
	return { due_at: at.toISOString(), status };
}

describe('which pile a task falls in', () => {
	it('reads the date in the local day, not the local instant', () => {
		// 9am today is behind NOW (noon) and is still today, not overdue: the
		// comparison is between days, which is what "due today" means.
		expect(taskBucket(due(0), NOW)).toBe('today');
		expect(taskBucket(due(-1), NOW)).toBe('overdue');
		expect(taskBucket(due(1), NOW)).toBe('week');
		expect(taskBucket(due(7), NOW)).toBe('week');
		expect(taskBucket(due(8), NOW)).toBe('later');
	});

	it('files a task with no due date under someday rather than overdue', () => {
		expect(taskBucket({ due_at: null, status: 'todo' }, NOW)).toBe('someday');
	});

	it('takes a finished task out of the timeline whatever its due date was', () => {
		// The most overdue task in the org is not overdue once it is done.
		expect(taskBucket(due(-30, 'done'), NOW)).toBe('done');
		expect(taskBucket({ due_at: null, status: 'done' }, NOW)).toBe('done');
		expect(taskIsOverdue(due(-30, 'done'), NOW)).toBe(false);
		expect(taskIsOverdue(due(-1), NOW)).toBe(true);
	});

	it('groups into every bucket, so the page renders a stable set of headings', () => {
		const piles = groupTasksByBucket(
			[due(-1), due(0), due(3), due(20), { due_at: null, status: 'todo' }, due(-2, 'done')],
			NOW
		);

		expect(Object.keys(piles)).toEqual([...TASK_BUCKETS]);
		expect(piles.overdue).toHaveLength(1);
		expect(piles.today).toHaveLength(1);
		expect(piles.week).toHaveLength(1);
		expect(piles.later).toHaveLength(1);
		expect(piles.someday).toHaveLength(1);
		expect(piles.done).toHaveLength(1);
	});
});

describe('which column a task sits in', () => {
	it('gives every column an entry even when nothing is in it', () => {
		const columns = groupTasksByStatus([{ status: 'todo' }, { status: 'todo' }], TASK_STATUSES);

		expect(Object.keys(columns)).toEqual([...TASK_STATUSES]);
		expect(columns.todo).toHaveLength(2);
		expect(columns.in_progress).toEqual([]);
		expect(columns.blocked).toEqual([]);
		expect(columns.done).toEqual([]);
	});

	it('keeps the order the page passed, so a board does not shuffle on reload', () => {
		const first = { status: 'todo' as const, id: 1 };
		const second = { status: 'todo' as const, id: 2 };
		expect(groupTasksByStatus([first, second], TASK_STATUSES).todo).toEqual([first, second]);
	});
});

describe('how a due date reads', () => {
	it('names the days near today rather than dating them', () => {
		expect(dueLabel(due(0), NOW)).toBe('Today');
		expect(dueLabel(due(1), NOW)).toBe('Tomorrow');
		expect(dueLabel(due(-1), NOW)).toBe('Yesterday');
		expect(dueLabel(due(-4), NOW)).toBe('4 days ago');
	});

	it('uses a weekday inside the coming week and a date past it', () => {
		// 2026-09-15 is a Tuesday, so three days on is a Friday.
		expect(dueLabel(due(3), NOW)).toBe('Friday');
		expect(dueLabel(due(20), NOW)).toBe('Oct 5');
	});

	it('says nothing at all when there is no due date', () => {
		expect(dueLabel({ due_at: null, status: 'todo' }, NOW)).toBeNull();
	});
});
