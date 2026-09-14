import { z } from 'zod';
import { RECORD_KINDS, type RecordKind } from '$lib/crm/records';

/**
 * A record as a picker posts it: `<kind>:<id>`, or blank for none.
 *
 * One field rather than a kind and an id so a half-set pair can never reach
 * the database — the calendar's `entity_link_complete` check, a task's party
 * columns. Shared by every form that links a row to "some record" (the
 * calendar's booking form, the task modal), so there is one spelling of what
 * a record picker posts and one parser on the way back.
 */
export const recordRefField = z
	.string()
	.trim()
	.default('')
	.refine((value) => value === '' || parseRecordRef(value) !== null, {
		error: 'Pick a record from the list.'
	});

/** The two halves of a posted record ref, or null when it is not one. */
export function parseRecordRef(value: string): { kind: RecordKind; id: string } | null {
	const [kind, id, ...rest] = value.split(':');
	if (rest.length > 0 || !id) return null;
	const known = RECORD_KINDS.find((candidate) => candidate === kind);
	return known && z.guid().safeParse(id).success ? { kind: known, id } : null;
}

/** What the picker posts for a record: the inverse of `parseRecordRef()`. */
export function recordRef(kind: RecordKind, id: string): string {
	return `${kind}:${id}`;
}

/** A record a picker offers: what it is, which one, and what it is called. */
export type LinkableRecord = { kind: RecordKind; id: string; name: string };
