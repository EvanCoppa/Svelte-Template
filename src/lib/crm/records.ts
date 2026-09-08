import type { Enums } from '$lib/database.types';
import { featureTerms, type Terms, type TermsMap } from '$lib/features/terms';
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
	'billable',
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
	billable: { feature: 'billables', segment: 'billables' },
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
export type RecordTerms = Terms;

/**
 * The words for a kind of record — `featureTerms()` keyed by the feature
 * that owns the kind: "Add quote", "3 quotes", "Quote not found".
 */
export function recordTerms(terms: TermsMap | undefined, kind: RecordKind): RecordTerms {
	return featureTerms(terms, RECORD_KIND_META[kind].feature);
}
