import type { z } from 'zod';
import type { Tables } from '$lib/database.types';
import type { Feature } from '$lib/features/types';
import type { RecordFormValues } from '$lib/schemas/records';
import {
	isCompanyColumnKey,
	isContactColumnKey,
	type CompanyColumnKey,
	type ContactColumnKey
} from './columns';
import {
	companyFilterSchema,
	contactFilterSchema,
	type CompanyFilter,
	type ContactFilter
} from './filter';
import { isViewLayout, isViewSource, type ViewLayout } from './types';

/**
 * From a `views` row to a definition the page and the runner can trust.
 *
 * The database checks what it can (a party source, known layouts, a default
 * among them); the JSON filter and the column keys it cannot, so this is
 * where they are checked — on every load, throwing with the view's id. A
 * throw here is a migration that shipped a bad row, and a 500 is the right
 * answer to that, the way `resolveVocabulary()` refuses a missing term.
 */

/** The row as the registry loads it (`loadViewRegistry()` in `$lib/server/features`). */
export type ViewRegistryRow = Pick<
	Tables<'views'>,
	'id' | 'source' | 'filter' | 'columns' | 'layouts' | 'default_layout'
>;

type ViewBase = {
	id: string;
	layouts: ViewLayout[];
	defaultLayout: ViewLayout;
	/** The route the view's feature row claims: `/views/<id>`. */
	href: string;
};

export type ViewDefinition = ViewBase &
	(
		| { source: 'company'; filter: CompanyFilter; columns: CompanyColumnKey[] }
		| { source: 'contact'; filter: ContactFilter; columns: ContactColumnKey[] }
	);

/** Where a view lives — what its `features.route` must be. */
export function viewHref(id: string): string {
	return `/views/${id}`;
}

export function resolveView(row: ViewRegistryRow, feature: Feature): ViewDefinition {
	const href = viewHref(row.id);
	if (feature.route !== href) {
		throw new Error(`View ${row.id} is registered at ${feature.route}, not ${href}.`);
	}
	if (feature.noun === null) {
		throw new Error(`View ${row.id} names no noun: its feature row must say what one row is.`);
	}
	if (!isViewSource(row.source)) {
		throw new Error(`View ${row.id} lists ${row.source}, which is not a kind a view can show.`);
	}

	const layouts = row.layouts.filter(isViewLayout);
	if (layouts.length !== row.layouts.length || layouts.length === 0) {
		throw new Error(`View ${row.id} offers a layout the app does not know.`);
	}
	if (!isViewLayout(row.default_layout) || !layouts.includes(row.default_layout)) {
		throw new Error(`View ${row.id} opens on a layout it does not offer.`);
	}
	const base: ViewBase = { id: row.id, layouts, defaultLayout: row.default_layout, href };

	switch (row.source) {
		case 'company':
			return {
				...base,
				source: 'company',
				filter: parseFilter(row, companyFilterSchema),
				columns: columnsOf(row, isCompanyColumnKey)
			};
		case 'contact':
			return {
				...base,
				source: 'contact',
				filter: parseFilter(row, contactFilterSchema),
				columns: columnsOf(row, isContactColumnKey)
			};
	}
}

function parseFilter<F>(row: ViewRegistryRow, schema: z.ZodType<F>): F {
	const parsed = schema.safeParse(row.filter);
	if (!parsed.success) {
		throw new Error(`View ${row.id} has an invalid filter: ${parsed.error.message}`);
	}
	return parsed.data;
}

/** The row's columns, checked against the source's catalog, with `name` forced first. */
function columnsOf<K extends string>(row: ViewRegistryRow, isKey: (key: string) => key is K): K[] {
	const keys: K[] = [];
	for (const key of row.columns) {
		if (!isKey(key)) throw new Error(`View ${row.id} shows a column it does not have: ${key}.`);
		if (!keys.includes(key)) keys.push(key);
	}
	// SAFETY: every catalog has a `name` column — it is the link into the record.
	const name = 'name' as K;
	return [name, ...keys.filter((key) => key !== name)];
}

/**
 * What the view's "Add …" form should start with, so a record created from
 * the view lands in it: every condition that pins one enum column to one
 * value becomes that field's default. "Vendors" opens the company form on
 * Supplier; a view of active people opens the contact form on Active.
 */
export function defaultsFor(view: ViewDefinition): Partial<RecordFormValues> {
	const defaults: Partial<RecordFormValues> = {};
	for (const condition of view.filter.where) {
		if (condition.op !== 'in' || condition.values.length !== 1) continue;
		const [only] = condition.values;
		if (only && (condition.field === 'relationship' || condition.field === 'status')) {
			defaults[condition.field] = only;
		}
	}
	return defaults;
}
