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
	class={cn('rounded-md border', className)}
	{...restProps}
>
	<Table.Root>
		<Table.Header>
			{#each dataTable.table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header (header.id)}
						<Table.Head colspan={header.colSpan} class="[&:has([role=checkbox])]:ps-3">
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
						<Table.Cell class="[&:has([role=checkbox])]:ps-3">
							<FlexRender {cell} />
						</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={dataTable.table.getAllColumns().length} class="h-24 text-center">
						{#if empty}{@render empty()}{:else}{emptyMessage}{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
