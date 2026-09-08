<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		noun = 'row',
		nounPlural,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** What a row is called in the readout, singularised as needed. */
		noun?: string;
		/**
		 * The plural, for the nouns `noun + 's'` gets wrong — company/companies,
		 * person/people. Defaults to the regular form.
		 */
		nounPlural?: string;
	} = $props();

	const dataTable = useDataTable();
	const pagination = $derived(dataTable.table.atoms.pagination.get());
	const shown = $derived(dataTable.table.getFilteredRowModel().rows.length);
	const total = $derived(dataTable.table.getCoreRowModel().rows.length);
	const selected = $derived(dataTable.table.getFilteredSelectedRowModel().rows.length);
	const plural = $derived((count: number) => (count === 1 ? noun : (nounPlural ?? `${noun}s`)));

	const pageCount = $derived(Math.max(1, dataTable.table.getPageCount()));
	// The page size is fitted to the viewport, so a shrinking table can leave the
	// index past the last page for a frame; the readout never shows that.
	const page = $derived(Math.min(pagination.pageIndex + 1, pageCount));

	// Both readouts sit in the same box, so the row reads the same from either end.
	const pill = 'bg-background flex h-9 items-center rounded-lg border shadow-xs';
</script>

<div
	bind:this={ref}
	data-slot="data-table-pagination"
	class={cn('flex items-center justify-between gap-4', className)}
	{...restProps}
>
	<!-- The count is always there; a selection is mentioned only once one exists.
	     It is the one readout that can outgrow its half of the row, so it is also
	     the one allowed to shrink. -->
	<div class={cn(pill, 'min-w-0')}>
		<p class="truncate px-3 text-sm tabular-nums">
			{#if selected > 0}
				<span class="font-semibold">{selected}</span>
				<span class="text-muted-foreground">of {shown} {plural(shown)} selected</span>
			{:else if shown === total}
				<span class="font-semibold">{total}</span>
				<span class="text-muted-foreground">{plural(total)}</span>
			{:else}
				<span class="font-semibold">{shown}</span>
				<span class="text-muted-foreground">of {total} {plural(total)}</span>
			{/if}
		</p>
	</div>

	<nav aria-label="Pagination" class={cn(pill, 'shrink-0')}>
		<p class="px-3 text-sm whitespace-nowrap tabular-nums">
			<span class="font-semibold">{page}</span>
			<span class="text-muted-foreground">of {pageCount}</span>
		</p>
		<div class="bg-border w-px self-stretch" aria-hidden="true"></div>
		<Button
			variant="ghost"
			size="icon"
			class="rounded-none"
			onclick={() => dataTable.table.setPageIndex(0)}
			disabled={!dataTable.table.getCanPreviousPage()}
		>
			<span class="sr-only">Go to first page</span>
			<ChevronsLeftIcon />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="rounded-none"
			onclick={() => dataTable.table.previousPage()}
			disabled={!dataTable.table.getCanPreviousPage()}
		>
			<span class="sr-only">Go to previous page</span>
			<ChevronLeftIcon />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="rounded-none"
			onclick={() => dataTable.table.nextPage()}
			disabled={!dataTable.table.getCanNextPage()}
		>
			<span class="sr-only">Go to next page</span>
			<ChevronRightIcon />
		</Button>
		<!-- The controls butt up against each other, so only this one keeps a
		     radius, and only on the end that meets the pill's corner. -->
		<Button
			variant="ghost"
			size="icon"
			class="rounded-s-none"
			onclick={() => dataTable.table.setPageIndex(dataTable.table.getPageCount() - 1)}
			disabled={!dataTable.table.getCanNextPage()}
		>
			<span class="sr-only">Go to last page</span>
			<ChevronsRightIcon />
		</Button>
	</nav>
</div>
