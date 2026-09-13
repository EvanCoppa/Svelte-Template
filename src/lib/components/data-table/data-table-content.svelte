<script lang="ts">
	import { FlexRender } from '@tanstack/svelte-table';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';
	import { pinnedColumnCount, trackPinned, type PinnedState } from './pinned.js';

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

	// The first column stays put while the rest scroll sideways when the table's
	// pin choice (`DataTable.Root`'s default, toggled from `ViewOptions`) says so.
	// When that column is the selection checkbox, the column after it is pinned
	// too — the checkbox belongs to the row, not to the column a reader holds onto.
	const pinnedCount = $derived(
		dataTable.pinFirstColumn
			? pinnedColumnCount(dataTable.table.getVisibleLeafColumns().map((column) => column.id))
			: 0
	);
	let pinned: PinnedState = $state({ offset: 0, scrolled: false });

	// A pinned cell is `sticky`; its opaque base is a `before` pseudo-element and
	// the row's hover / selected tint an `after` one, because the cell's own
	// background is what the row rules tint, and a translucent tint over a
	// scrolled column would show the cells sliding underneath.
	const PINNED_CELL =
		'sticky z-10 before:bg-background after:pointer-events-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 after:absolute after:inset-0 after:-z-10 [tr:hover>&]:after:bg-muted/50 [tr[data-state=selected]>&]:after:bg-muted';
	const PINNED_HEAD = 'after:bg-muted/60';
	const PINNED_EDGE = 'border-border/60 border-e-2';
	const PINNED_EDGE_SCROLLED =
		'shadow-[6px_0_8px_-6px_rgb(0_0_0/0.18)] dark:shadow-[6px_0_8px_-6px_rgb(0_0_0/0.6)]';

	function pinnedClass(index: number, head: boolean): string | false {
		if (index >= pinnedCount) return false;
		return cn(
			PINNED_CELL,
			head && PINNED_HEAD,
			index === pinnedCount - 1 && PINNED_EDGE,
			index === pinnedCount - 1 && pinned.scrolled && PINNED_EDGE_SCROLLED
		);
	}

	function pinnedStyle(index: number): string | undefined {
		if (index >= pinnedCount) return undefined;
		return `left: ${index === 0 ? 0 : pinned.offset}px`;
	}
</script>

<div
	bind:this={ref}
	data-slot="data-table-content"
	class={cn('border-border/60 overflow-hidden rounded-2xl border-2', className)}
	{...restProps}
	{@attach dataTable.pinFirstColumn ? trackPinned((state) => (pinned = state)) : undefined}
>
	<Table.Root>
		<Table.Header>
			{#each dataTable.table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header, index (header.id)}
						{@const sorted = header.column.getIsSorted()}
						<Table.Head
							colspan={header.colSpan}
							aria-sort={sorted === 'asc'
								? 'ascending'
								: sorted === 'desc'
									? 'descending'
									: undefined}
							data-pinned={index < pinnedCount ? 'true' : undefined}
							style={pinnedStyle(index)}
							class={cn(
								header.column.id === 'select' && 'w-8 ps-3 pe-0',
								header.column.id === 'actions' && 'w-8 pe-3',
								header.column.columnDef.meta?.class,
								pinnedClass(index, true)
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
					{#each row.getVisibleCells() as cell, index (cell.id)}
						<Table.Cell
							data-pinned={index < pinnedCount ? 'true' : undefined}
							style={pinnedStyle(index)}
							class={cn(
								cell.column.id === 'select' && 'w-8 ps-3 pe-0',
								cell.column.id === 'actions' && 'w-8 pe-3',
								cell.column.columnDef.meta?.class,
								pinnedClass(index, false)
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
