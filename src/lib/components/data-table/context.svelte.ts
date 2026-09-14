import type { RowData, SvelteTable } from '@tanstack/svelte-table';
import { getContext, setContext } from 'svelte';
import type { DataTableFeatures } from './features.js';
import type { PinnedCellKind } from './pinned.js';

type Getter<T> = () => T;

export type DataTableStateProps<TData extends RowData> = {
	/**
	 * A getter (not a raw value) so the `table` prop on `DataTable.Root` stays
	 * the single source of truth — a copied instance would go stale if the page
	 * ever swapped tables.
	 */
	table: Getter<SvelteTable<DataTableFeatures, TData>>;
	/**
	 * Whether the first column stays put while the rest scroll — a per-device
	 * choice `DataTable.Root` remembers and `ViewOptions` toggles.
	 */
	pinFirstColumn: { get current(): boolean; set current(value: boolean) };
};

/**
 * Coordination state only: the page-owned table instance the parts share.
 * Application data (the rows) still enters through `createTable` on the page.
 */
class DataTableState<TData extends RowData> {
	readonly props: DataTableStateProps<TData>;
	table = $derived.by(() => this.props.table());

	get pinFirstColumn(): boolean {
		return this.props.pinFirstColumn.current;
	}
	set pinFirstColumn(value: boolean) {
		this.props.pinFirstColumn.current = value;
	}

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

export type DataTableRowsProps = {
	/**
	 * The visible leaf columns, in order — the boundaries a nested row's cells
	 * line up with, so hiding a column from `ViewOptions` moves the rows an
	 * expanded row opens with it.
	 */
	columns: Getter<readonly string[]>;
	/** The classes a cell at this index needs to stay pinned; `false` when it scrolls. */
	pinnedClass: (index: number, kind: PinnedCellKind) => string | false;
	/** Where a pinned cell sits; `undefined` when it scrolls with the rest. */
	pinnedStyle: (index: number) => string | undefined;
};

/**
 * What `DataTable.Content` knows about the shape of a row and the parts it
 * renders inside its `detail` snippet do not: which columns are on screen and
 * which of their cells are pinned. Coordination only — a nested row's content
 * still arrives from the page, at the `DataTable.SubRow` that draws it.
 */
class DataTableRowsState {
	readonly props: DataTableRowsProps;
	columns = $derived.by(() => this.props.columns());

	constructor(props: DataTableRowsProps) {
		this.props = props;
	}

	pinnedClass = (index: number, kind: PinnedCellKind) => this.props.pinnedClass(index, kind);
	pinnedStyle = (index: number) => this.props.pinnedStyle(index);
}

const ROWS_SYMBOL_KEY = 'app-data-table-rows';

export function setDataTableRows(props: DataTableRowsProps): DataTableRowsState {
	return setContext(Symbol.for(ROWS_SYMBOL_KEY), new DataTableRowsState(props));
}

/**
 * Read by the parts a page composes inside `DataTable.Content`'s `detail`
 * snippet. This is a class instance, so consumers must not destructure it.
 */
export function useDataTableRows(): DataTableRowsState {
	const state = getContext<DataTableRowsState | undefined>(Symbol.for(ROWS_SYMBOL_KEY));
	if (!state) {
		throw new Error(
			'DataTable.SubRow / DataTable.SubSection must be used inside <DataTable.Content>.'
		);
	}
	return state;
}
