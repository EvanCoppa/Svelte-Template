import { daysBetween, startOfDay } from '$lib/calendar';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import type { Enums, Tables } from '$lib/database.types';

/**
 * What a task IS to the browser: which pile it falls in, and how its due date
 * reads. Pure on purpose, like `$lib/crm/billables.ts` — the board and the
 * grouped list both ask these questions and neither should answer them itself.
 *
 * **Every Date here is local**, the rule `$lib/calendar.ts` sets and for the
 * same reason: "overdue" and "today" are wall-clock words, so the piles are
 * worked out in the reader's own zone after hydration rather than in whichever
 * zone the server happens to sit in.
 */

/** A row as any of these functions needs it — never the whole record. */
export type TaskLike = Pick<Tables<'tasks'>, 'due_at' | 'status'>;

/**
 * The piles the list page comes in, in the order it shows them. A bucket is a
 * question about WHEN, except the last: finished work leaves the timeline, or
 * every list ends in a month of things nobody has to do.
 */
export const TASK_BUCKETS = ['overdue', 'today', 'week', 'later', 'someday', 'done'] as const;

export type TaskBucket = (typeof TASK_BUCKETS)[number];

/** How many days ahead still counts as "this week" rather than "later". */
const WEEK_AHEAD = 7;

export const TASK_BUCKET_LABEL = {
	overdue: 'Overdue',
	today: 'Today',
	week: 'This week',
	later: 'Later',
	someday: 'No due date',
	done: 'Done'
} satisfies Record<TaskBucket, string>;

/** Red for late, amber for now, and nothing loud for work that can wait. */
export const TASK_BUCKET_TONE = {
	overdue: 'error',
	today: 'warning',
	week: 'info',
	later: 'neutral',
	someday: 'neutral',
	done: 'success'
} satisfies Record<TaskBucket, BadgeTone>;

/**
 * Which pile one task falls in. `now` is passed rather than read so the
 * function is the same on both sides of hydration and a test can say when
 * "today" is.
 */
export function taskBucket(task: TaskLike, now: Date): TaskBucket {
	if (task.status === 'done') return 'done';
	if (!task.due_at) return 'someday';
	const days = daysBetween(startOfDay(now), startOfDay(new Date(task.due_at)));
	if (days < 0) return 'overdue';
	if (days === 0) return 'today';
	if (days <= WEEK_AHEAD) return 'week';
	return 'later';
}

/** One org's tasks in their piles, every bucket present so the page renders a stable set of headings. */
export function groupTasksByBucket<T extends TaskLike>(
	tasks: readonly T[],
	now: Date
): Record<TaskBucket, T[]> {
	// SAFETY: built by mapping TASK_BUCKETS, so there is exactly one entry per
	// bucket and the object is complete before a task is placed in it.
	const piles = Object.fromEntries(TASK_BUCKETS.map((b) => [b, [] as T[]])) as Record<
		TaskBucket,
		T[]
	>;
	for (const task of tasks) piles[taskBucket(task, now)].push(task);
	return piles;
}

/** One org's tasks in their columns, every column present for the same reason. */
export function groupTasksByStatus<T extends Pick<Tables<'tasks'>, 'status'>>(
	tasks: readonly T[],
	statuses: readonly Enums<'task_status'>[]
): Record<Enums<'task_status'>, T[]> {
	// SAFETY: built by mapping `statuses`, so every column the caller named has
	// an entry before a task is placed in one — the same construction, and the
	// same reason, as `groupTasksByBucket` above.
	const columns = Object.fromEntries(statuses.map((s) => [s, [] as T[]])) as Record<
		Enums<'task_status'>,
		T[]
	>;
	for (const task of tasks) columns[task.status]?.push(task);
	return columns;
}

const dayMonth = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

/**
 * When a task is due, in as few words as carry the meaning: the days near
 * today are named rather than dated, because "Tomorrow" is read faster than a
 * date the reader has to work out. Null when there is no due date — the row
 * says nothing rather than "—", since the heading it sits under already did.
 */
export function dueLabel(task: TaskLike, now: Date): string | null {
	if (!task.due_at) return null;
	const due = new Date(task.due_at);
	const days = daysBetween(startOfDay(now), startOfDay(due));
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	if (days === -1) return 'Yesterday';
	if (days < 0) return `${String(-days)} days ago`;
	// Inside the coming week a weekday is unambiguous and needs no date.
	if (days <= WEEK_AHEAD) return weekday.format(due);
	return dayMonth.format(due);
}

/** True when the task is late — the one thing a row says in red. */
export function taskIsOverdue(task: TaskLike, now: Date): boolean {
	return taskBucket(task, now) === 'overdue';
}
