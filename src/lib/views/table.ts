import { createColumnHelper, renderComponent } from '@tanstack/svelte-table';
import * as DataTable from '$lib/components/data-table/index.js';
import type { TermsMap } from '$lib/features/terms';
import type { ViewCell, ViewRow } from './columns';
import { columnLabel, columnMetas } from './columns';
import type { ViewDefinition } from './resolve';

/**
 * A view's table columns, built from its definition — the client half of
 * `describeViewRows()`: the server put a typed cell in every position, and
 * this turns each position into a TanStack column that sorts by the cell's
 * text and draws it by its type. The page composes the result exactly as a
 * list page composes its hand-written columns.
 */

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function renderCell(cell: ViewCell) {
	switch (cell.type) {
		case 'link':
			return cell.href === null ? cell.text : DataTable.linkCell(cell.text, cell.href);
		case 'status':
			return DataTable.statusCell(cell.text, cell.tone);
		case 'text':
			return cell.text === '' ? '—' : cell.text;
		case 'datetime':
			return date.format(new Date(cell.text));
	}
}

export function viewColumns(view: ViewDefinition, terms: TermsMap | undefined) {
	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ViewRow>();
	const metas = columnMetas(view);
	return columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		...view.columns.map((key, index) => {
			const title = columnLabel(metas[index]?.label ?? { text: key }, terms);
			return columnHelper.accessor((row) => row.cells[index]?.text ?? '', {
				id: key,
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title }),
				cell: ({ row }) => {
					const cell = row.original.cells[index];
					return cell ? renderCell(cell) : '';
				}
			});
		})
	]);
}
