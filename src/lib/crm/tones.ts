import type { KanbanRingFill } from '$lib/components/kanban/index.js';
import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import type { Enums, Tables } from '$lib/database.types';

/**
 * The badge tone for every enum the CRM renders as a pill, in one place, so
 * a status is the same colour in a list cell, a record header and a
 * related-records row. Each map is checked against its enum, so a value the
 * schema grows is a `check` error here rather than an unstyled pill.
 */

export const PARTY_STATUS_TONE = {
	lead: 'info',
	prospect: 'violet',
	active: 'success',
	inactive: 'neutral'
} satisfies Record<Enums<'party_status'>, BadgeTone>;

export const COMPANY_RELATIONSHIP_TONE = {
	customer: 'success',
	supplier: 'cyan',
	partner: 'indigo',
	other: 'neutral'
} satisfies Record<Enums<'company_relationship'>, BadgeTone>;

export const ASSET_STATUS_TONE = {
	active: 'success',
	inactive: 'neutral',
	retired: 'warning'
} satisfies Record<Enums<'asset_status'>, BadgeTone>;

export const PROPERTY_STATUS_TONE = {
	active: 'success',
	inactive: 'neutral',
	sold: 'info'
} satisfies Record<Enums<'property_status'>, BadgeTone>;

export const PRODUCT_KIND_TONE = {
	good: 'cyan',
	service: 'violet'
} satisfies Record<Enums<'product_kind'>, BadgeTone>;

/**
 * Stages are org-defined rows, so their names are not a union to key a
 * palette off. The outcome is: every board has open, won and lost columns
 * whatever an org calls them.
 */
export const STAGE_OUTCOME_TONE = {
	open: 'info',
	won: 'success',
	lost: 'error'
} satisfies Record<Enums<'stage_outcome'>, BadgeTone>;

/** A proposal's lifecycle: out for decision is the active state, accepted the good end. */
export const PROPOSAL_STATUS_TONE = {
	draft: 'neutral',
	sent: 'info',
	viewed: 'violet',
	accepted: 'success',
	declined: 'error',
	expired: 'warning'
} satisfies Record<Enums<'proposal_status'>, BadgeTone>;

export const TICKET_STATUS_TONE = {
	open: 'info',
	pending: 'warning',
	resolved: 'success',
	closed: 'neutral'
} satisfies Record<Enums<'ticket_status'>, BadgeTone>;

export const PRIORITY_TONE = {
	low: 'neutral',
	normal: 'info',
	high: 'orange',
	urgent: 'error'
} satisfies Record<Enums<'priority'>, BadgeTone>;

/**
 * Where a task sits on the board. `done` is pinned to `completed_at` by
 * trigger (the task board migration), so a done card and a ticked checkbox
 * are the same row in the same state — there is no second flag to disagree.
 */
export const TASK_STATUS_TONE = {
	todo: 'neutral',
	in_progress: 'info',
	blocked: 'warning',
	in_review: 'violet',
	done: 'success'
} satisfies Record<Enums<'task_status'>, BadgeTone>;

/**
 * The one enum in the app whose values are not already words, so the label
 * lives next to the tone rather than in whichever screen drew it first —
 * "in_progress" is not a thing to show anybody. Board column, list heading and
 * record pill all read it, which is what keeps them from disagreeing.
 */
export const TASK_STATUS_LABEL = {
	todo: 'To do',
	in_progress: 'In progress',
	blocked: 'Blocked',
	in_review: 'In review',
	done: 'Done'
} satisfies Record<Enums<'task_status'>, string>;

/**
 * Every state a task can be in, in workflow order: not started, moving, stuck,
 * waiting on a reader, finished. The board draws them grouped
 * (`TASK_STATUS_GROUPS` below) — this is the list of values, which is what the
 * move schema and the list view want.
 */
export const TASK_STATUSES = [
	'todo',
	'in_progress',
	'blocked',
	'in_review',
	'done'
] as const satisfies readonly Enums<'task_status'>[];

/**
 * How full a status's ring is drawn, so the states read as a workflow filling
 * up rather than a handful of colours. `blocked` shares `in_progress`'s
 * fraction on purpose: being stuck is not progress, and a board that showed it
 * as more would reward getting stuck. `in_review` is nearly full and not full:
 * the work is out of the doer's hands, and it can still come back.
 */
export const TASK_STATUS_RING = {
	todo: 'empty',
	in_progress: 0.5,
	blocked: 0.5,
	in_review: 0.75,
	done: 'done'
} satisfies Record<Enums<'task_status'>, KanbanRingFill>;

/**
 * The board's columns — **status groups**. The four statuses are the states a
 * task is in; a group is how the board is read, and the two are not the same
 * question. Nobody scanning a board wants four columns to find the one piece
 * of work that is moving: "in progress" and "blocked" are one place on the
 * wall and two different things to know about a card, so they share a column
 * and the card says which it is.
 *
 * A group is **not** a state — nothing is ever stored as `doing`. Dropping a
 * card on a column holding one status writes that status; dropping on a column
 * holding several asks which, through the board's drop zones.
 */
export type TaskStatusGroup = {
	/** Names the column to the board. Never written to a record. */
	id: string;
	label: string;
	tone: BadgeTone;
	/** The states under it, in the order they are shown, with their own words. */
	statuses: readonly { value: Enums<'task_status'>; label: string }[];
};

function statusGroup(
	id: string,
	label: string,
	tone: BadgeTone,
	...statuses: Enums<'task_status'>[]
): TaskStatusGroup {
	return {
		id,
		label,
		tone,
		// Named from the one label map, so a status is never called two things.
		statuses: statuses.map((value) => ({ value, label: TASK_STATUS_LABEL[value] }))
	};
}

/**
 * Left to right: not started, on the wall, waiting on somebody else, finished.
 * A module-level constant rather than something the page builds, because the
 * board registers the statuses of each column and an array rebuilt every
 * render would churn that registration.
 *
 * `in_review` gets a column of its own rather than sharing "In progress" the
 * way `blocked` does, because the question a column answers is "whose is
 * this?" — everything under In progress is the doer's, and a task in review is
 * the reader's. Work waiting on somebody who is not looking at the board is
 * exactly what a board exists to make visible.
 */
export const TASK_STATUS_GROUPS: readonly TaskStatusGroup[] = [
	statusGroup('todo', 'To do', TASK_STATUS_TONE.todo, 'todo'),
	statusGroup('doing', 'In progress', TASK_STATUS_TONE.in_progress, 'in_progress', 'blocked'),
	statusGroup('review', 'In review', TASK_STATUS_TONE.in_review, 'in_review'),
	statusGroup('done', 'Done', TASK_STATUS_TONE.done, 'done')
];

/** Whether a task is finished, asked of the column rather than the timestamp. */
export function taskIsDone(task: Pick<Tables<'tasks'>, 'status'>): boolean {
	return task.status === 'done';
}

/** An invoice's own lifecycle: being written, out with the customer, or withdrawn. */
export const INVOICE_STATUS_TONE = {
	draft: 'neutral',
	issued: 'info',
	void: 'warning'
} satisfies Record<Enums<'invoice_status'>, BadgeTone>;

/**
 * The money axis of an invoice (and later an order), a second pill beside
 * the status: how much of what it asks for has arrived.
 */
export const PAYMENT_STATE_TONE = {
	unpaid: 'warning',
	partial: 'info',
	paid: 'success'
} satisfies Record<Enums<'payment_state'>, BadgeTone>;

/** Which way money moved: in, or back out to the customer. */
export const PAYMENT_KIND_TONE = {
	payment: 'success',
	refund: 'rose'
} satisfies Record<Enums<'payment_kind'>, BadgeTone>;

/**
 * How money moved, as a person would say it — the one enum here whose values
 * are abbreviations ("ach") rather than words, so the label lives beside
 * the vocabulary the way the task statuses' do.
 */
export const PAYMENT_METHOD_LABEL = {
	check: 'Check',
	ach: 'ACH',
	wire: 'Wire',
	card: 'Card',
	cash: 'Cash',
	credit: 'Credit',
	other: 'Other'
} satisfies Record<Enums<'payment_method'>, string>;

/** The ways money moves, in the order the payment form offers them. */
export const PAYMENT_METHODS = [
	'check',
	'ach',
	'wire',
	'card',
	'cash',
	'credit',
	'other'
] as const satisfies readonly Enums<'payment_method'>[];
