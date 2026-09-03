<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		pageSizeOptions = [10, 20, 30, 40, 50],
		selectable = false,
		noun = 'row',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Choices offered in the rows-per-page picker. */
		pageSizeOptions?: number[];
		/**
		 * Set when the table has a selection column, so the readout reports what
		 * is selected. Without one, a "0 of 3 row(s) selected" line describes a
		 * control the table does not offer — it counts the rows instead.
		 */
		selectable?: boolean;
		/** What a row is called in the count, singularised by the readout. */
		noun?: string;
	} = $props();

	const dataTable = useDataTable();
	const pagination = $derived(dataTable.table.atoms.pagination.get());
	const shown = $derived(dataTable.table.getFilteredRowModel().rows.length);
	const total = $derived(dataTable.table.getCoreRowModel().rows.length);
</script>

<div
	bind:this={ref}
	data-slot="data-table-pagination"
	class={cn('flex items-center justify-between px-2', className)}
	{...restProps}
>
	<div class="text-muted-foreground flex-1 text-sm">
		{#if selectable}
			{dataTable.table.getFilteredSelectedRowModel().rows.length} of
			{shown}
			{noun}(s) selected.
		{:else if shown === total}
			{total}
			{total === 1 ? noun : `${noun}s`}
		{:else}
			{shown} of {total}
			{total === 1 ? noun : `${noun}s`}
		{/if}
	</div>
	<div class="flex items-center space-x-6 lg:space-x-8">
		<div class="flex items-center space-x-2">
			<p class="text-sm font-medium">Rows per page</p>
			<Combobox
				size="sm"
				class="w-20"
				ariaLabel="Rows per page"
				searchable={false}
				options={pageSizeOptions.map(String)}
				value={String(pagination.pageSize)}
				onchange={(value) => dataTable.table.setPageSize(Number(value))}
			/>
		</div>
		<div class="flex w-28 items-center justify-center text-sm font-medium">
			Page {pagination.pageIndex + 1} of {Math.max(1, dataTable.table.getPageCount())}
		</div>
		<div class="flex items-center space-x-2">
			<Button
				variant="outline"
				class="hidden size-8 p-0 lg:flex"
				onclick={() => dataTable.table.setPageIndex(0)}
				disabled={!dataTable.table.getCanPreviousPage()}
			>
				<span class="sr-only">Go to first page</span>
				<ChevronsLeftIcon />
			</Button>
			<Button
				variant="outline"
				class="size-8 p-0"
				onclick={() => dataTable.table.previousPage()}
				disabled={!dataTable.table.getCanPreviousPage()}
			>
				<span class="sr-only">Go to previous page</span>
				<ChevronLeftIcon />
			</Button>
			<Button
				variant="outline"
				class="size-8 p-0"
				onclick={() => dataTable.table.nextPage()}
				disabled={!dataTable.table.getCanNextPage()}
			>
				<span class="sr-only">Go to next page</span>
				<ChevronRightIcon />
			</Button>
			<Button
				variant="outline"
				class="hidden size-8 p-0 lg:flex"
				onclick={() => dataTable.table.setPageIndex(dataTable.table.getPageCount() - 1)}
				disabled={!dataTable.table.getCanNextPage()}
			>
				<span class="sr-only">Go to last page</span>
				<ChevronsRightIcon />
			</Button>
		</div>
	</div>
</div>
