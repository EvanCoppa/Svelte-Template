import type { RecordKind } from '$lib/crm/records';
import type { Enums } from '$lib/database.types';

/**
 * Views — a query with a page.
 *
 * A view is a `views` row (the views migration): a SOURCE (which kind of
 * record it lists), a FILTER (which of them, as JSON validated by
 * `filter.ts`), the COLUMNS it shows and the LAYOUTS it offers — a table, a
 * map of the records' addresses, or both. Its id is also a `features` row
 * whose route is `/views/<id>`, which is what gives it a sidebar entry, a
 * ⌘K hit, a gate, a title, an industry's own name and role grants with no
 * code: "Vendors" in a CRM, "Suppliers" on a roof, "Patient map" in a
 * practice are each one migration inserting rows, and the one page at
 * `src/routes/(app)/views/[view=view]/` renders all of them.
 *
 * Everything in this folder is client-safe: the page draws what the server
 * described (`$lib/server/crm/views`) and never learns a source's columns.
 */

/** The kinds of record a view may list. Both are parties, so both have addresses to map. */
export const VIEW_SOURCES = ['company', 'contact'] as const satisfies readonly RecordKind[];

export type ViewSource = (typeof VIEW_SOURCES)[number];

/** Whether a `crm_entity_type` is one a view may list — the narrowing the resolver needs. */
export function isViewSource(value: Enums<'crm_entity_type'>): value is ViewSource {
	return VIEW_SOURCES.some((source) => source === value);
}

/** How a view can show its records. The `views.layouts` check constraint mirrors this list. */
export const VIEW_LAYOUTS = ['table', 'map'] as const;

export type ViewLayout = (typeof VIEW_LAYOUTS)[number];

export function isViewLayout(value: string): value is ViewLayout {
	return VIEW_LAYOUTS.some((layout) => layout === value);
}

/**
 * One address with coordinates, ready to draw: the record it belongs to, as
 * a link when the reader may open it. The server makes these
 * (`pinsFor()` in `$lib/server/crm/views`); the map draws them.
 */
export type ViewPin = {
	/** The address id — one record can have several pins. */
	id: string;
	recordId: string;
	label: string;
	/** Null when the reader may not open the record's kind. */
	href: string | null;
	latitude: number;
	longitude: number;
};
