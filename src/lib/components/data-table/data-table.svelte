<script lang="ts" generics="TData extends RowData">
	import type { RowData, SvelteTable } from '@tanstack/svelte-table';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { setDataTable } from './context.svelte.js';
	import type { DataTableFeatures } from './features.js';
	import { fitPageSize, MIN_PAGE_SIZE } from './page-size.js';

	let {
		ref = $bindable(null),
		table,
		pageSize,
		minPageSize = MIN_PAGE_SIZE,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/**
		 * The page-owned table instance from `createTable({ features, … })`,
		 * shared with every `DataTable.*` part via context.
		 */
		table: SvelteTable<DataTableFeatures, TData>;
		/**
		 * Rows per page. Leave it off — the usual case — and the table fits its
		 * own: as many rows as the space between it and the bottom of the
		 * viewport holds, re-measured whenever that space changes. Set it only
		 * where a screen wants a fixed number, such as a table inside a card or
		 * partway down a long page, where there is no viewport to fill.
		 */
		pageSize?: number;
		/** Floor for the fitted size, so a short viewport still lists something. */
		minPageSize?: number;
	} = $props();

	setDataTable({ table: () => table });

	// A fixed size belongs to the first render rather than to a correction made
	// after hydration, so it is applied as the component initialises and the
	// server paints the right number of rows too; the effect picks up a later
	// change to the prop.
	let applied = pageSize;
	if (applied !== undefined) table.setPageSize(applied);

	$effect(() => {
		if (pageSize === undefined || pageSize === applied) return;
		applied = pageSize;
		table.setPageSize(pageSize);
	});
</script>

<div
	bind:this={ref}
	data-slot="data-table"
	class={cn('space-y-4', className)}
	{...restProps}
	{@attach pageSize === undefined
		? fitPageSize({ setPageSize: (size) => table.setPageSize(size), minPageSize })
		: undefined}
>
	{@render children?.()}
</div>
