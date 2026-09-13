import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
import * as DataTable from '$lib/components/data-table/index.js';
import { localDate } from '$lib/crm/ledger';
import { RECORD_KIND_META } from '$lib/crm/records';
import type { TermsMap } from '$lib/features/terms';
import { term, type Vocabulary } from '$lib/features/vocabulary';
import { capitalize } from '$lib/utils.js';
import { cellSortValue, paymentTone, paymentWord } from './cells';
import type { FieldLabel, ListCell, ListField, ListRow, ListSpec } from './types';

/**
 * A list's table, built from its spec — the client half of
 * `describeListRows()`: the server put a typed cell in every position, and
 * this turns each position into a TanStack column that sorts by the cell's
 * value, draws it by its type, and tells the toolbar what it may do with it
 * — `enableGlobalFilter` for a searchable field, `meta.filter` for a
 * filterable one. A field that is not `shown` still gets its column, hidden
 * to start with, so the search box and the filters reach it and the reader
 * can switch it on from `DataTable.ViewOptions`.
 *
 * Every list page composes the result the same way:
 *
 *   const table = createListTable(() => data.list, () => page.data.terms);
 *   <DataTable.Root {table}> <DataTable.Toolbar> … <DataTable.Content /> …
 *
 * A list with a field labelled by the vocabulary (a proposal's presenter,
 * its owner) passes a third getter: `() => page.data.vocabulary`.
 */

// Fixed locale on purpose: the server render and the hydrated render must
// agree, and the visitor's own locale would differ from the server's.
const number = new Intl.NumberFormat('en-US');
const instant = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
// A `date` column has no time zone: read it as the day it names, not
// shifted into the viewer's zone.
const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const money = (value: number, currency: string) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

/**
 * A column's heading: its text, the word for the kind it names as the org's
 * industry says it (read from the terms the layout shipped — a kind whose
 * feature is off for this org has no terms, so it falls back to the kind's
 * own name rather than throwing), or a word that belongs to no feature (who
 * presents a proposal, who is responsible for it), read from the vocabulary
 * the layout ships unconditionally.
 */
export function fieldLabel(
	label: FieldLabel,
	terms: TermsMap | undefined,
	vocabulary: Vocabulary | undefined
): string {
	if ('text' in label) return label.text;
	if ('term' in label) return term(vocabulary, label.term);
	const noun = terms?.[RECORD_KIND_META[label.kind].feature]?.noun;
	return capitalize(noun ?? label.kind);
}

function renderCell(cell: ListCell, today: string) {
	switch (cell.type) {
		case 'link':
			return cell.href === null ? cell.text : DataTable.linkCell(cell.text, cell.href);
		case 'record':
			if (cell.text === '') return '—';
			return cell.href === null ? cell.text : DataTable.linkCell(cell.text, cell.href);
		case 'status':
			return DataTable.statusCell(cell.text, cell.tone);
		case 'text':
			return cell.text === '' ? '—' : cell.text;
		case 'number':
			return cell.value === null ? '—' : number.format(cell.value);
		case 'money': {
			if (cell.value === null) return '—';
			const amount = money(cell.value, cell.currency);
			return cell.unit ? `${amount} / ${cell.unit}` : amount;
		}
		case 'boolean':
			return cell.value === null ? '—' : cell.value ? 'Yes' : 'No';
		case 'date':
			return cell.value === null ? '—' : day.format(new Date(cell.value));
		case 'datetime':
			return cell.value === null ? '—' : instant.format(new Date(cell.value));
		case 'payment': {
			const word = paymentWord(cell, today);
			return word === '' ? '—' : DataTable.statusCell(word, paymentTone(word));
		}
	}
}

/** Whether the sort compares numbers (an amount, a count) or text (everything else). */
function sortFn(field: ListField): 'basic' | 'text' {
	return field.type === 'number' || field.type === 'money' ? 'basic' : 'text';
}

export function listColumns(
	spec: ListSpec,
	terms: TermsMap | undefined,
	vocabulary: Vocabulary | undefined,
	today: string
) {
	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ListRow>();
	return columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		...spec.fields.map((field, index) => {
			const title = fieldLabel(field.label, terms, vocabulary);
			return columnHelper.accessor(
				(row) => {
					const cell = row.cells[index];
					return cell ? cellSortValue(cell, today) : null;
				},
				{
					id: field.key,
					header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title }),
					cell: ({ row }) => {
						const cell = row.original.cells[index];
						return cell ? renderCell(cell, today) : '';
					},
					sortFn: sortFn(field),
					// The name is the way into the record; it is never hidden.
					enableHiding: field.key !== 'name',
					enableGlobalFilter: field.searchable,
					enableColumnFilter: field.filterable,
					filterFn: 'oneOf',
					meta: { title, filter: field.filterable ? { options: field.options } : null }
				}
			);
		})
	]);
}

/**
 * The table for a list page: the spec's columns over the rows, both read
 * through getters so a reload of the page data (a record added, the org
 * switched) reaches the table. The search box scans exactly the searchable
 * fields; a filter reads a cell's text (`cellText()`), which is what its
 * options are made of.
 */
export function createListTable(
	list: () => { spec: ListSpec; rows: ListRow[] },
	terms: () => TermsMap | undefined,
	// Only a proposals-shaped list has a term-labelled column today; every
	// other page's call site leaves this out.
	vocabulary: () => Vocabulary | undefined = () => undefined
) {
	// "Overdue" is decided by the viewer's own date, once per page.
	const today = localDate(new Date());
	const hidden = Object.fromEntries(
		list()
			.spec.fields.filter((field) => !field.shown)
			.map((field) => [field.key, false])
	);
	return createTable({
		features: DataTable.features,
		get data() {
			return list().rows;
		},
		get columns() {
			return listColumns(list().spec, terms(), vocabulary(), today);
		},
		initialState: { columnVisibility: hidden },
		globalFilterFn: 'includesString',
		// The columns say which of them search (`enableGlobalFilter`); the
		// default guess from the first row's value type is not wanted.
		getColumnCanGlobalFilter: () => true
	});
}
