import Root from './data-table.svelte';
import ColumnHeader from './data-table-column-header.svelte';
import Content from './data-table-content.svelte';
import Pagination from './data-table-pagination.svelte';
import ViewOptions from './data-table-view-options.svelte';

export { features, type DataTableFeatures } from './features.js';

export {
	Root,
	ColumnHeader,
	Content,
	Pagination,
	ViewOptions,
	//
	Root as DataTable,
	ColumnHeader as DataTableColumnHeader,
	Content as DataTableContent,
	Pagination as DataTablePagination,
	ViewOptions as DataTableViewOptions
};
