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

export const TICKET_STATUS_TONE = {
	open: 'info',
	pending: 'warning',
	resolved: 'success',
	closed: 'neutral'
} satisfies Record<Enums<'ticket_status'>, BadgeTone>;

export const TICKET_PRIORITY_TONE = {
	low: 'neutral',
	normal: 'info',
	high: 'orange',
	urgent: 'error'
} satisfies Record<Enums<'ticket_priority'>, BadgeTone>;

/** A task has no status column: done is `completed_at` being set (see tasks.ts). */
export type TaskState = 'open' | 'done';

export const TASK_STATE_TONE = {
	open: 'info',
	done: 'success'
} satisfies Record<TaskState, BadgeTone>;

export function taskState(task: Pick<Tables<'tasks'>, 'completed_at'>): TaskState {
	return task.completed_at ? 'done' : 'open';
}
