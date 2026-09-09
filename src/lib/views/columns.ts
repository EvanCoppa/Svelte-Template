import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { RECORD_KIND_META, type RecordKind } from '$lib/crm/records';
import type { TermsMap } from '$lib/features/terms';
import { capitalize } from '$lib/utils.js';
import type { ViewDefinition } from './resolve';

/**
 * The columns a view may show, per source — the catalog `views.columns`
 * picks from — and the cell each becomes.
 *
 * The page never sees a `Company` or a `Contact`: the server reads the rows
 * and describes each one as a `ViewRow`, cells typed by how they RENDER
 * (`describeViewRows()` in `$lib/server/crm/views`), the rule `RecordDetail`
 * follows for the record page. A column's label is either fixed text or the
 * name of a kind of record, which the page words through `recordTerms()` —
 * "Company" to a roofer, never a constant here.
 *
 * `name` is every source's first column and renders as the link into the
 * record (`DataTable.linkCell`); the resolver puts it first whatever the row
 * says. `city` is the primary address's, from the same addresses the map
 * pins come from.
 */

/** Fixed text, or the word for a kind of record as the industry says it. */
export type ViewColumnLabel = { text: string } | { kind: RecordKind };

export type ViewColumnMeta = { label: ViewColumnLabel };

export const COMPANY_COLUMNS = {
	name: { label: { text: 'Name' } },
	relationship: { label: { text: 'Relationship' } },
	status: { label: { text: 'Status' } },
	email: { label: { text: 'Email' } },
	phone: { label: { text: 'Phone' } },
	website: { label: { text: 'Website' } },
	city: { label: { text: 'City' } },
	created_at: { label: { text: 'Added' } }
} satisfies Record<string, ViewColumnMeta>;

export const CONTACT_COLUMNS = {
	name: { label: { text: 'Name' } },
	company: { label: { kind: 'company' } },
	title: { label: { text: 'Title' } },
	email: { label: { text: 'Email' } },
	phone: { label: { text: 'Phone' } },
	status: { label: { text: 'Status' } },
	city: { label: { text: 'City' } },
	created_at: { label: { text: 'Added' } }
} satisfies Record<string, ViewColumnMeta>;

export type CompanyColumnKey = keyof typeof COMPANY_COLUMNS;
export type ContactColumnKey = keyof typeof CONTACT_COLUMNS;

export function isCompanyColumnKey(key: string): key is CompanyColumnKey {
	return Object.hasOwn(COMPANY_COLUMNS, key);
}

export function isContactColumnKey(key: string): key is ContactColumnKey {
	return Object.hasOwn(CONTACT_COLUMNS, key);
}

/** The catalog entry behind each of a view's columns, in the view's order. */
export function columnMetas(view: ViewDefinition): ViewColumnMeta[] {
	switch (view.source) {
		case 'company':
			return view.columns.map((key) => COMPANY_COLUMNS[key]);
		case 'contact':
			return view.columns.map((key) => CONTACT_COLUMNS[key]);
	}
}

/**
 * A column's heading: its text, or the word for the kind it names as the
 * org's industry says it — read from the terms the layout shipped. A kind
 * whose feature is off for this org has no terms; its column is still a
 * column (a contact's company is a fact whether or not Companies is on),
 * so it falls back to the kind's own name rather than throwing.
 */
export function columnLabel(label: ViewColumnLabel, terms: TermsMap | undefined): string {
	if ('text' in label) return label.text;
	const noun = terms?.[RECORD_KIND_META[label.kind].feature]?.noun;
	return capitalize(noun ?? label.kind);
}

/** One cell of a view's table, typed by how the page draws it. */
export type ViewCell =
	/** The record's name; `href` is null when the reader may not open its kind. */
	| { type: 'link'; text: string; href: string | null }
	/** An enum value as a pill, in the tone the shared maps give it. */
	| { type: 'status'; text: string; tone: BadgeTone }
	/** Plain text; blank when the column is empty (the page prints a dash). */
	| { type: 'text'; text: string }
	/** An instant, as ISO; the page formats it. */
	| { type: 'datetime'; text: string };

/** One record as a view lists it: its cells in the view's column order. */
export type ViewRow = { id: string; cells: ViewCell[] };
