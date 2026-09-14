import {
	columnFilteringFeature,
	columnVisibilityFeature,
	constructFilterFn,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	metaHelper,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_text,
	tableFeatures
} from '@tanstack/svelte-table';
import type { FilterOption } from '$lib/lists/types';

/**
 * What a column may tell the toolbar about itself. `title` is the heading
 * `ViewOptions` lists it under; `filter` says it is one of the toolbar's
 * filters (`DataTable.Filters`) and, when its values are known up front,
 * which — otherwise the filter offers whatever the rows on screen hold.
 */
export type DataTableColumnMeta = {
	title?: string;
	filter?: { options: readonly FilterOption[] | null } | null;
	/** Extra classes for the column's header and cells — a narrower name column, say. */
	class?: string;
};

/** What a filterable column's accessor reads: a cell's text, or nothing. */
export type FilterReading = string | number | null | undefined;

/** A toolbar filter's state: the values picked, as strings. */
export type FilterSelection = readonly string[];

/**
 * "The value is one of these": the filter every toolbar filter uses. The
 * filter value is the selected values; none selected means no filter, and
 * the table drops the entry rather than matching nothing.
 */
export const filterFn_oneOf = constructFilterFn({
	filter: (dataValue: FilterReading, filterValue: FilterSelection) =>
		filterValue.includes(String(dataValue ?? '')),
	autoRemove: (filterValue: FilterSelection | undefined) => !filterValue || filterValue.length === 0
});

/**
 * The one feature baseline every data table in this app registers.
 *
 * TanStack Table v9 makes features opt-in so unused ones tree-shake away; this
 * preset pins the app's baseline — sorting, column and global filtering,
 * column visibility, pagination and row selection — so every table behaves
 * the same and every column definition can type against a single
 * `DataTableFeatures`. A page that needs more (faceting, grouping, …) extends
 * the table it creates; it does not fork this preset, because two presets
 * would fork that type.
 *
 * Global filtering is what `DataTable.Search` drives: it scans the columns
 * that opt in with `enableGlobalFilter` (a list's searchable fields), and
 * every other column stays out of it.
 */
export const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortedRowModel: createSortedRowModel(),
	// v9 only ships the filter/sort functions you register. These cover the
	// string/number columns a CRUD screen actually has, plus the toolbar's.
	filterFns: { includesString: filterFn_includesString, oneOf: filterFn_oneOf },
	sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
	columnMeta: metaHelper<DataTableColumnMeta>()
});

export type DataTableFeatures = typeof features;
