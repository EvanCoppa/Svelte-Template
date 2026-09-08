<script lang="ts">
	import { FlexRender } from '@tanstack/svelte-table';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		emptyMessage = 'No results.',
		empty,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Text for the placeholder row shown when no rows survive filtering. */
		emptyMessage?: string;
		/** Replaces `emptyMessage` with custom placeholder-row content. */
		empty?: Snippet;
	} = $props();

	const dataTable = useDataTable();
</script>

<div
	bind:this={ref}
	data-slot="data-table-content"
	class={cn('border-border/60 overflow-hidden rounded-2xl border-2', className)}
	{...restProps}
>
	<Table.Root>
		<Table.Header>
			{#each dataTable.table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header (header.id)}
						{@const sorted = header.column.getIsSorted()}
						<Table.Head
							colspan={header.colSpan}
							aria-sort={sorted === 'asc'
								? 'ascending'
								: sorted === 'desc'
									? 'descending'
									: undefined}
							class={cn(
								header.column.id === 'select' && 'w-8 ps-3 pe-0',
								header.column.id === 'actions' && 'w-8 pe-3'
							)}
						>
							{#if !header.isPlaceholder}
								<FlexRender {header} />
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#each dataTable.table.getRowModel().rows as row (row.id)}
				<Table.Row data-state={row.getIsSelected() && 'selected'}>
					{#each row.getVisibleCells() as cell (cell.id)}
						<Table.Cell
							class={cn(
								cell.column.id === 'select' && 'w-8 ps-3 pe-0',
								cell.column.id === 'actions' && 'w-8 pe-3'
							)}
						>
							<FlexRender {cell} />
						</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<!-- `data-empty` keeps this taller placeholder out of the row-height probe
				     that fits the page size to the viewport (see `page-size.ts`). -->
				<Table.Row data-empty="true">
					<Table.Cell
						colspan={dataTable.table.getVisibleLeafColumns().length}
						class="h-24 text-center"
					>
						{#if empty}{@render empty()}{:else}{emptyMessage}{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
