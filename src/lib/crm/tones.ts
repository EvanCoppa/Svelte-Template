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
	done: 'Done'
} satisfies Record<Enums<'task_status'>, string>;

/** The board's columns, left to right: not started, moving, stuck, finished. */
export const TASK_STATUSES = [
	'todo',
	'in_progress',
	'blocked',
	'done'
] as const satisfies readonly Enums<'task_status'>[];

/** Whether a task is finished, asked of the column rather than the timestamp. */
export function taskIsDone(task: Pick<Tables<'tasks'>, 'status'>): boolean {
	return task.status === 'done';
}
