<script lang="ts">
	import { useDataTable } from './context.svelte.js';
	import Filter from './data-table-filter.svelte';

	/**
	 * A filter for every column that asked for one — the columns whose
	 * `meta.filter` is set, in column order. A list's filterable fields
	 * declare that through `createListTable()`; a hand-written column sets
	 * `meta: { filter: { options } }` (or `options: null` to offer what the
	 * rows hold) and gets the same control.
	 */
	const dataTable = useDataTable();

	const columns = $derived(
		dataTable.table
			.getAllLeafColumns()
			.filter((column) => column.columnDef.meta?.filter && column.getCanFilter())
	);
</script>

{#each columns as column (column.id)}
	<Filter {column} />
{/each}
