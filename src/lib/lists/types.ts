import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import type { RecordKind } from '$lib/crm/records';
import type { Enums } from '$lib/database.types';

/**
 * Lists — a list is its fields, and the industry chooses them.
 *
 * Every list page (a kind's own — /companies, /assets — and every view)
 * draws one table with one toolbar over it: a search box and a filter per
 * column worth filtering. Which columns, which of them the box searches and
 * which get a filter are ROWS (`list_fields`, with an industry's own say in
 * `industry_list_fields` — the list_fields migration), resolved per industry
 * into a `ListSpec` by `resolve.ts` and drawn by `table.ts`. A built-in field
 * is a key from the kind's catalog (`catalog.ts`); a custom field is one of
 * the org's definitions for the kind, carrying its own list flags — so a
 * distributor's Assets page shows a serial number and filters by a location
 * no code names.
 *
 * Everything in this folder is client-safe: the page draws what the server
 * described (`$lib/server/crm/lists`) — rows of cells typed by how they
 * render, the rule the record page's `RecordDetail` follows — and never
 * learns a source's columns.
 */

/** The kinds of record that have a list page. Tasks are a board, not a table. */
export const LIST_KINDS = [
	'asset',
	'billable',
	'company',
	'contact',
	'product',
	'deal',
	'proposal',
	'invoice',
	'ticket'
] as const satisfies readonly RecordKind[];

export type ListKind = (typeof LIST_KINDS)[number];

/**
 * How a field renders — and therefore what the toolbar may do with it. A
 * filter is a multi-select of values, so only a field whose cell is a value
 * worth picking from a list can be filtered: text, an enum, a yes/no, another
 * record, a payment state. An amount or a date cannot (`FILTERABLE_TYPES`).
 */
export type FieldType =
	| 'text'
	| 'number'
	| 'money'
	| 'boolean'
	| 'date'
	| 'datetime'
	| 'enum'
	| 'record'
	| 'person'
	| 'payment';

export const FILTERABLE_TYPES = [
	'text',
	'enum',
	'boolean',
	'record',
	'payment'
] as const satisfies readonly FieldType[];

/** Fixed text, or the word for a kind of record as the industry says it. */
export type FieldLabel = { text: string } | { kind: RecordKind };

/** One value a filter offers; `tone` when the value is drawn as a pill. */
export type FilterOption = { value: string; label: string; tone?: BadgeTone };

/** One field of a list, as the page draws it — a resolved `list_fields` row. */
export type ListField = {
	/** The catalog key, or a custom field's column id (`customFieldColumnId()`). */
	key: string;
	label: FieldLabel;
	type: FieldType;
	/** A column on the table. A hidden field still searches and filters. */
	shown: boolean;
	searchable: boolean;
	filterable: boolean;
	/**
	 * The values a filter offers when they are known up front (an enum's, a
	 * select field's); null means "whatever the rows on screen hold".
	 */
	options: readonly FilterOption[] | null;
	/** Set for a custom field: which definition the cell reads. */
	custom: { definitionId: string; valueType: Enums<'custom_field_value_type'> } | null;
};

/** A list as one page draws it: the kind it lists and its fields in order. */
export type ListSpec = { kind: ListKind; fields: ListField[] };

/** One cell of a list's table, typed by how the page draws it. */
export type ListCell =
	/** The record's name; `href` is null when the reader may not open its kind. */
	| { type: 'link'; text: string; href: string | null }
	/** An enum value as a pill, in the tone the shared maps give it. */
	| { type: 'status'; text: string; tone: BadgeTone }
	/** Another record, linked when the reader may open its kind; blank when none. */
	| { type: 'record'; text: string; href: string | null }
	/**
	 * A member of this org — an assignee, drawn as plain text like the record
	 * page's `person` field (a member has no page of their own to link to;
	 * the roster is where people who work here are read).
	 */
	| { type: 'person'; userId: string | null; name: string | null }
	/** Plain text; blank when the column is empty (the page prints a dash). */
	| { type: 'text'; text: string }
	| { type: 'number'; value: number | null }
	| { type: 'money'; value: number | null; currency: string; unit: string | null }
	| { type: 'boolean'; value: boolean | null }
	/** A calendar date (a `date` column); the page reads it in no zone. */
	| { type: 'date'; value: string | null }
	/** An instant (a `timestamptz` column); the page formats it. */
	| { type: 'datetime'; value: string | null }
	/**
	 * An invoice's money state. "Overdue" is a wall-clock word — the viewer's
	 * own date decides it — so the cell carries what the browser needs to
	 * say it rather than a word the server guessed (docs/ledger.md).
	 */
	| {
			type: 'payment';
			state: Enums<'payment_state'> | null;
			dueDate: string | null;
			owed: boolean;
	  };

/** One record as a list draws it: its cells in the spec's field order. */
export type ListRow = { id: string; cells: ListCell[] };
