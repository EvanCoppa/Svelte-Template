<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';

	/**
	 * The search box: one field that scans every column that opted in with
	 * `enableGlobalFilter` (a list's searchable fields; the staff roster's
	 * member column) through the table's global filter. Typing narrows the
	 * rows as you go; there is nothing to submit.
	 */
	let {
		placeholder = 'Search…',
		ariaLabel = 'Search',
		class: className
	}: { placeholder?: string; ariaLabel?: string; class?: string } = $props();

	const dataTable = useDataTable();

	const value = $derived(String(dataTable.table.atoms.globalFilter.get() ?? ''));
</script>

<div data-slot="data-table-search" class={cn('relative w-full max-w-xs', className)}>
	<SearchIcon
		aria-hidden="true"
		class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
	/>
	<Input
		type="search"
		{placeholder}
		aria-label={ariaLabel}
		{value}
		oninput={(event) => dataTable.table.setGlobalFilter(event.currentTarget.value)}
		class="ps-9"
	/>
</div>
