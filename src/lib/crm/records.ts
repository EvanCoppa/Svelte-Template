import type { Enums } from '$lib/database.types';
import type { TermsMap } from '$lib/features/terms';
import type { FeatureId } from '$lib/features/types';

/**
 * The CRM record kinds that have a page of their own, and where that page
 * lives — the client-safe half of `$lib/server/crm/records`.
 *
 * Every kind here is a `crm_entity_type` (the polymorphic link the whole CRM
 * shares) that also has a list page, so a row in that list can open as a
 * record. The generic record page at `(app)/[kind=record]/[id=guid]` serves
 * all of them from one route: a kind's records sit under its list route
 * (`/contacts/<id>`), which is what lets the feature gate in
 * `hooks.server.ts` cover the record with no extra wiring — it already gates
 * everything under `/contacts`. A kind that later earns a specific page adds
 * `src/routes/(app)/contacts/[id]/`; SvelteKit ranks the static segment above
 * `[kind=record]`, so the specific page wins and this one stays the default
 * for the rest.
 *
 * Proposal options are an entity type too, but have no list page: an option
 * is read through its proposal.
 */
export const RECORD_KINDS = [
	'company',
	'contact',
	'product',
	'deal',
	'proposal',
	'task',
	'ticket'
] as const satisfies readonly Enums<'crm_entity_type'>[];

export type RecordKind = (typeof RECORD_KINDS)[number];

export type RecordKindMeta = {
	/** The feature whose gate covers the kind's pages — and whose terms name it. */
	feature: FeatureId;
	/** The list route's one path segment; the record page is `/<segment>/<id>`. */
	segment: string;
};

/**
 * What a kind is called is NOT here: a kind's words are its feature's, as
 * the org's industry says them (`recordTerms()` below), never a constant.
 */
export const RECORD_KIND_META = {
	company: { feature: 'companies', segment: 'companies' },
	contact: { feature: 'contacts', segment: 'contacts' },
	product: { feature: 'products', segment: 'products' },
	deal: { feature: 'deals', segment: 'deals' },
	proposal: { feature: 'proposals', segment: 'proposals' },
	task: { feature: 'tasks', segment: 'tasks' },
	ticket: { feature: 'tickets', segment: 'tickets' }
} as const satisfies Record<RecordKind, RecordKindMeta>;

/** A path segment the `[kind=record]` matcher accepts: one kind's list route. */
export type RecordSegment = (typeof RECORD_KIND_META)[RecordKind]['segment'];

/** The list page for a kind — the way back from a record. */
export function recordListHref(kind: RecordKind): string {
	return `/${RECORD_KIND_META[kind].segment}`;
}

/** The record page for one record — what a list row links to. */
export function recordHref(kind: RecordKind, id: string): string {
	return `${recordListHref(kind)}/${id}`;
}

/** Whether a path segment is a kind's list route — the matcher's question. */
export function isRecordSegment(segment: string): segment is RecordSegment {
	return RECORD_KINDS.some((kind) => RECORD_KIND_META[kind].segment === segment);
}

/** The kind served under a matched segment. Total, because the matcher already said yes. */
export function recordKindForSegment(segment: RecordSegment): RecordKind {
	for (const kind of RECORD_KINDS) {
		if (RECORD_KIND_META[kind].segment === segment) return kind;
	}
	// Unreachable for a RecordSegment; the throw keeps the return type honest
	// without a cast.
	throw new Error(`No record kind is served under /${segment}.`);
}

/** What a kind of record is called, as the org's industry words it. */
export type RecordTerms = {
	/** The list, as the sidebar names it: "Treatment plans". */
	name: string;
	/** One of them, lower-case: "treatment plan" — "Add treatment plan". */
	noun: string;
	/** The list in running text: "treatment plans" — "3 treatment plans". */
	plural: string;
};

/**
 * The words for a kind of record, from the terms the `(app)` layout shipped
 * (`visibleTerms()` in `$lib/features/terms`; the server calls it directly).
 * Throws for a kind whose feature is not on screen or names no noun —
 * unreachable on a page the gate served, so the throw keeps the return type
 * honest without a cast, the `recordKindForSegment` rule.
 */
export function recordTerms(terms: TermsMap | undefined, kind: RecordKind): RecordTerms {
	const feature = RECORD_KIND_META[kind].feature;
	const found = terms?.[feature];
	if (!found?.noun) {
		throw new Error(`No terms for ${kind}: the ${feature} feature is not on screen.`);
	}
	return { name: found.name, noun: found.noun, plural: found.name.toLowerCase() };
}
