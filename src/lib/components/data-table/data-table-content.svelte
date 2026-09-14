<script lang="ts" generics="TData extends RowData">
	import { FlexRender, type RowData } from '@tanstack/svelte-table';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { setDataTableRows, useDataTable } from './context.svelte.js';
	import {
		pinnedCellClass,
		pinnedCellStyle,
		pinnedColumnCount,
		trackPinned,
		type PinnedCellKind,
		type PinnedState
	} from './pinned.js';

	let {
		ref = $bindable(null),
		class: className,
		emptyMessage = 'No results.',
		empty,
		detail,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Text for the placeholder row shown when no rows survive filtering. */
		emptyMessage?: string;
		/** Replaces `emptyMessage` with custom placeholder-row content. */
		empty?: Snippet;
		/**
		 * What an open row shows, drawn straight after it as more rows of this
		 * same table (`DataTable.SubSection` and `DataTable.SubRow`), so a
		 * nested value lands under the column it belongs to. Rendered only
		 * while the row is expanded; pair it with `DataTable.expandColumn()`
		 * and the table's `getRowCanExpand` (docs/lists.md, "A row that opens").
		 */
		detail?: Snippet<[TData]>;
	} = $props();

	const dataTable = useDataTable();

	// The first column stays put while the rest scroll sideways when the table's
	// pin choice (`DataTable.Root`'s default, toggled from `ViewOptions`) says so.
	// When the columns in front of it are row controls — the expand chevron, the
	// selection checkbox — they are pinned too, since they belong to the row
	// rather than to the column a reader holds onto.
	const visibleColumns = $derived(
		dataTable.table.getVisibleLeafColumns().map((column) => column.id)
	);
	const pinnedCount = $derived(dataTable.pinFirstColumn ? pinnedColumnCount(visibleColumns) : 0);
	let pinned: PinnedState = $state({ offsets: [], scrolled: false });

	function pinnedClass(index: number, kind: PinnedCellKind): string | false {
		return pinnedCellClass(index, pinnedCount, pinned.scrolled, kind);
	}

	function pinnedStyle(index: number): string | undefined {
		return pinnedCellStyle(index, pinnedCount, pinned.offsets);
	}

	// The parts a page composes inside `detail` are rendered here, so they read
	// the columns and the pinning from this context rather than being told.
	setDataTableRows({
		columns: () => visibleColumns,
		pinnedClass,
		pinnedStyle
	});
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
								header.column.id === 'expand' && 'w-8 ps-3 pe-0',
								header.column.id === 'select' && 'w-8 ps-3 pe-0',
								header.column.id === 'actions' && 'w-8 pe-3',
								header.column.columnDef.meta?.class,
								pinnedClass(index, 'head')
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
				{@const expanded = row.getIsExpanded()}
				<Table.Row
					data-state={row.getIsSelected() && 'selected'}
					data-expanded={expanded ? 'true' : undefined}
					class="data-[expanded=true]:[&>td]:bg-muted/40"
				>
					{#each row.getVisibleCells() as cell, index (cell.id)}
						<Table.Cell
							data-pinned={index < pinnedCount ? 'true' : undefined}
							style={pinnedStyle(index)}
							class={cn(
								cell.column.id === 'expand' && 'w-8 ps-3 pe-0',
								cell.column.id === 'select' && 'w-8 ps-3 pe-0',
								cell.column.id === 'actions' && 'w-8 pe-3',
								cell.column.columnDef.meta?.class,
								pinnedClass(index, 'cell')
							)}
						>
							<FlexRender {cell} />
						</Table.Cell>
					{/each}
				</Table.Row>
				<!-- The nested rows are rows of this table, not a grid of their own:
				     that is what keeps their cells under the columns they belong to
				     as the reader hides, pins or scrolls past them. -->
				{#if detail && expanded}
					{@render detail(row.original as TData)}
				{/if}
			{:else}
				<!-- `data-empty` keeps this taller placeholder out of the row-height probe
				     that fits the page size to the viewport (see `page-size.ts`). -->
				<Table.Row data-empty="true">
					<Table.Cell colspan={visibleColumns.length} class="h-24 text-center">
						{#if empty}{@render empty()}{:else}{emptyMessage}{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
