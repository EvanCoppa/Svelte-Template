import Root from './data-table.svelte';
import ColumnHeader from './data-table-column-header.svelte';
import Content from './data-table-content.svelte';
import Filter from './data-table-filter.svelte';
import Filters from './data-table-filters.svelte';
import Pagination from './data-table-pagination.svelte';
import Search from './data-table-search.svelte';
import Toolbar from './data-table-toolbar.svelte';
import ViewOptions from './data-table-view-options.svelte';

export { features, type DataTableColumnMeta, type DataTableFeatures } from './features.js';
export { linkCell, statusCell } from './cells.js';
export { actionsColumn, selectColumn } from './columns.js';

export {
	Root,
	ColumnHeader,
	Content,
	Filter,
	Filters,
	Pagination,
	Search,
	Toolbar,
	ViewOptions,
	//
	Root as DataTable,
	ColumnHeader as DataTableColumnHeader,
	Content as DataTableContent,
	Filter as DataTableFilter,
	Filters as DataTableFilters,
	Pagination as DataTablePagination,
	Search as DataTableSearch,
	Toolbar as DataTableToolbar,
	ViewOptions as DataTableViewOptions
};
