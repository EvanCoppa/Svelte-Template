<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import type { HTMLAttributes } from 'svelte/elements';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		pageSizeOptions = [10, 20, 30, 40, 50],
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Choices offered in the rows-per-page picker. */
		pageSizeOptions?: number[];
	} = $props();

	const dataTable = useDataTable();
	const pagination = $derived(dataTable.table.atoms.pagination.get());
</script>

<div
	bind:this={ref}
	data-slot="data-table-pagination"
	class={cn('flex items-center justify-between px-2', className)}
	{...restProps}
>
	<div class="text-muted-foreground flex-1 text-sm">
		{dataTable.table.getFilteredSelectedRowModel().rows.length} of
		{dataTable.table.getFilteredRowModel().rows.length} row(s) selected.
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
			<UntitledButton
				color="secondary"
				size="xs"
				class="hidden lg:inline-flex"
				aria-label="Go to first page"
				onclick={() => dataTable.table.setPageIndex(0)}
				disabled={!dataTable.table.getCanPreviousPage()}
			>
				{#snippet iconLeading()}<ChevronsLeftIcon />{/snippet}
			</UntitledButton>
			<UntitledButton
				color="secondary"
				size="xs"
				aria-label="Go to previous page"
				onclick={() => dataTable.table.previousPage()}
				disabled={!dataTable.table.getCanPreviousPage()}
			>
				{#snippet iconLeading()}<ChevronLeftIcon />{/snippet}
			</UntitledButton>
			<UntitledButton
				color="secondary"
				size="xs"
				aria-label="Go to next page"
				onclick={() => dataTable.table.nextPage()}
				disabled={!dataTable.table.getCanNextPage()}
			>
				{#snippet iconLeading()}<ChevronRightIcon />{/snippet}
			</UntitledButton>
			<UntitledButton
				color="secondary"
				size="xs"
				class="hidden lg:inline-flex"
				aria-label="Go to last page"
				onclick={() => dataTable.table.setPageIndex(dataTable.table.getPageCount() - 1)}
				disabled={!dataTable.table.getCanNextPage()}
			>
				{#snippet iconLeading()}<ChevronsRightIcon />{/snippet}
			</UntitledButton>
		</div>
	</div>
</div>
