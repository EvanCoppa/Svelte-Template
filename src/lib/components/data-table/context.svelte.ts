import type { RowData, SvelteTable } from '@tanstack/svelte-table';
import { getContext, setContext } from 'svelte';
import type { DataTableFeatures } from './features.js';

type Getter<T> = () => T;

export type DataTableStateProps<TData extends RowData> = {
	/**
	 * A getter (not a raw value) so the `table` prop on `DataTable.Root` stays
	 * the single source of truth — a copied instance would go stale if the page
	 * ever swapped tables.
	 */
	table: Getter<SvelteTable<DataTableFeatures, TData>>;
};

/**
 * Coordination state only: the page-owned table instance the parts share.
 * Application data (the rows) still enters through `createTable` on the page.
 */
class DataTableState<TData extends RowData> {
	readonly props: DataTableStateProps<TData>;
	table = $derived.by(() => this.props.table());

	constructor(props: DataTableStateProps<TData>) {
		this.props = props;
	}
}

const SYMBOL_KEY = 'app-data-table';

export function setDataTable<TData extends RowData>(
	props: DataTableStateProps<TData>
): DataTableState<TData> {
	return setContext(Symbol.for(SYMBOL_KEY), new DataTableState(props));
}

/**
 * Parts read the table with its row type erased to `RowData` — `getContext`
 * cannot carry `TData` across the boundary, and every part sticks to
 * row-type-agnostic table APIs (header groups, row models, columns, pagination).
 * This is a class instance, so consumers must not destructure it.
 */
export function useDataTable(): DataTableState<RowData> {
	const state = getContext<DataTableState<RowData> | undefined>(Symbol.for(SYMBOL_KEY));
	if (!state) throw new Error('DataTable.* parts must be used inside <DataTable.Root>.');
	return state;
}
