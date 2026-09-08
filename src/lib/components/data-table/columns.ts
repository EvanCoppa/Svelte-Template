import {
	renderComponent,
	type CellContext,
	type ColumnDefTemplate,
	type ColumnHelper,
	type RowData
} from '@tanstack/svelte-table';
import { Checkbox } from '$lib/components/ui/checkbox/index.js';
import type { DataTableFeatures } from './features.js';

/**
 * Column definitions shared by list pages, so a job every table has looks the
 * same in every table. Plain functions returning TanStack column defs — pass
 * them into the page's `columnHelper.columns([...])`.
 */

/**
 * The selection column: a checkbox at the start of every row and a select-all
 * in the header, driven by the row-selection feature every data table
 * registers. Goes first in the column list; `DataTable.Pagination` reports
 * what is selected once anything is.
 */
export function selectColumn<TData extends RowData>(
	columnHelper: ColumnHelper<DataTableFeatures, TData>
) {
	return columnHelper.display({
		id: 'select',
		header: ({ table }) =>
			renderComponent(Checkbox, {
				checked: table.getIsAllPageRowsSelected(),
				indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
				onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(!!value),
				'aria-label': 'Select all rows'
			}),
		cell: ({ row }) =>
			renderComponent(Checkbox, {
				checked: row.getIsSelected(),
				onCheckedChange: (value: boolean) => row.toggleSelected(!!value),
				'aria-label': 'Select row'
			}),
		enableSorting: false,
		enableHiding: false
	});
}

/**
 * The row-actions column: no header label — the "…" trigger every row renders
 * is self-explanatory — and pinned narrow at the end of the row, the same
 * shape on every table that has one. Pass the page's own row-actions cell
 * (typically a `renderComponent` of a `RowActions`-style dropdown); this
 * helper only fixes the column's id and chrome, since what a row can do is
 * different per table.
 */
export function actionsColumn<TData extends RowData>(
	columnHelper: ColumnHelper<DataTableFeatures, TData>,
	cell: ColumnDefTemplate<CellContext<DataTableFeatures, TData, unknown>>
) {
	return columnHelper.display({
		id: 'actions',
		header: () => '',
		cell,
		enableSorting: false,
		enableHiding: false
	});
}
