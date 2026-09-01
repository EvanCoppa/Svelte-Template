import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_text,
	tableFeatures
} from '@tanstack/svelte-table';

/**
 * The one feature baseline every data table in this app registers.
 *
 * TanStack Table v9 makes features opt-in so unused ones tree-shake away; this
 * preset pins the app's baseline — sorting, column filtering, column
 * visibility, pagination and row selection — so every table behaves the same
 * and every column definition can type against a single `DataTableFeatures`.
 * A page that needs more (faceting, grouping, …) extends the table it creates;
 * it does not fork this preset, because two presets would fork that type.
 */
export const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortedRowModel: createSortedRowModel(),
	// v9 only ships the filter/sort functions you register. These two sets cover
	// the string/number columns a CRUD screen actually has.
	filterFns: { includesString: filterFn_includesString },
	sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text }
});

export type DataTableFeatures = typeof features;
