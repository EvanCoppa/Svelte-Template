import type { RecordKind } from './records';

/**
 * Visits — the client-safe half of `$lib/server/crm/visits`.
 *
 * A visit is "somebody went somewhere, about one CRM record, and something
 * came of it" (the visits migration). Two things about it need answering on
 * both sides of the wire, so they live here: which kinds of record you can go
 * and see, and how a device's fix travels through a form.
 */

/**
 * The kinds a visit may be about — the things you can go and see. Mirrors
 * `visits_subject_is_visitable` in the visits migration exactly, and widening
 * means changing both: the constraint refuses the row, this refuses the form.
 *
 * A visit is never about a visit, which is also what keeps the subject from
 * recursing when the record page resolves it.
 */
export const VISIT_SUBJECT_KINDS = [
	'company',
	'contact',
	'deal',
	'property',
	'asset'
] as const satisfies readonly RecordKind[];

export type VisitSubjectKind = (typeof VISIT_SUBJECT_KINDS)[number];

/** Whether a kind can be visited — the narrowing a subject read off a row needs. */
export function isVisitSubjectKind(kind: string): kind is VisitSubjectKind {
	return VISIT_SUBJECT_KINDS.some((subject) => subject === kind);
}

/**
 * What a visit is called: its subject's name, and nothing else.
 *
 * A visit has no name column — it is named for who was visited, the way a
 * lease is named for what is rented and by whom. The date is deliberately not
 * folded in: formatting one is the browser's job with the locale the lists
 * use (the rule `$lib/server/crm/records` states), and the list draws
 * `occurred_at` as its own column beside this one.
 *
 * The fallback is for a subject the reader cannot see — RLS hid it, or it was
 * deleted in the moment between the two reads — never for a subject that does
 * not exist, which the database refuses.
 */
export function visitName(subject: string | null | undefined): string {
	return subject?.trim() || 'Visit';
}

/**
 * How a visit's subject travels as one value: `<kind>:<id>`, the ledger's
 * `company:<id>` account key generalised over every visitable kind. One field
 * rather than "pick a kind, then pick a record", because that is two questions
 * for one answer — and one string, which is what every record-form field is.
 */
export function visitSubjectKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

/**
 * The pair back out of that key. Total for a value the visit schema accepted,
 * which is the only place this is called from; a malformed one throws rather
 * than guessing a kind, because guessing would write the link to the wrong
 * table and the database would accept it.
 */
export function splitVisitSubject(value: string): [VisitSubjectKind, string] {
	const separator = value.indexOf(':');
	const kind = value.slice(0, separator);
	const id = value.slice(separator + 1);
	if (!isVisitSubjectKind(kind) || id === '') {
		throw new Error(`"${value}" does not name a record a visit can be to.`);
	}
	return [kind, id];
}

/** A device's answer to "where am I": a point, and how sure it is in metres. */
export type VisitFix = {
	latitude: number;
	longitude: number;
	/** `GeolocationCoordinates.accuracy`, when the device reported one. */
	accuracy: number | null;
};

/**
 * A fix as one form field.
 *
 * Every record-form field posts a string — that is what lets one component
 * render them all — so a fix travels as `"<lat>,<lng>"` with the accuracy
 * appended when there is one, and this pair of functions is the only place
 * that shape is known. Two numbers in one field rather than two fields
 * because neither half is separately typeable or separately meaningful: a
 * latitude with no longitude is not half a location, it is not one.
 */
export function formatFix(fix: VisitFix | null): string {
	if (!fix) return '';
	const point = `${fix.latitude},${fix.longitude}`;
	return fix.accuracy === null ? point : `${point},${fix.accuracy}`;
}

const coordinate = (value: string, limit: number): number | null => {
	const parsed = value.trim() === '' ? Number.NaN : Number(value);
	return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
};

/**
 * The fix a form posted, or null when it posted none.
 *
 * Deliberately strict, for the reason every record action re-parses with the
 * concrete schema: an action can be POSTed directly, so nothing unparseable,
 * out of range or negative reaches a column. A malformed value reads as "no
 * location", never as a wrong one — a visit is worth keeping without a fix,
 * and a fix nobody can trust is worse than none.
 */
export function parseFix(value: string | null | undefined): VisitFix | null {
	const parts = (value ?? '').split(',');
	if (parts.length < 2 || parts.length > 3) return null;

	const latitude = coordinate(parts[0] ?? '', 90);
	const longitude = coordinate(parts[1] ?? '', 180);
	if (latitude === null || longitude === null) return null;

	const raw = parts[2];
	if (raw === undefined || raw.trim() === '') return { latitude, longitude, accuracy: null };
	const accuracy = Number(raw);
	// A radius that is not a number, or is negative, says nothing about how
	// sure the device was — so the point stands and the radius does not.
	return {
		latitude,
		longitude,
		accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null
	};
}
