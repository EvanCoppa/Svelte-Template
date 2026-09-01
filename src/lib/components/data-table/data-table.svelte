<script lang="ts" generics="TData extends RowData">
	import type { RowData, SvelteTable } from '@tanstack/svelte-table';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { setDataTable } from './context.svelte.js';
	import type { DataTableFeatures } from './features.js';

	let {
		ref = $bindable(null),
		table,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/**
		 * The page-owned table instance from `createTable({ features, … })`,
		 * shared with every `DataTable.*` part via context.
		 */
		table: SvelteTable<DataTableFeatures, TData>;
	} = $props();

	setDataTable({ table: () => table });
</script>

<div bind:this={ref} data-slot="data-table" class={cn('space-y-4', className)} {...restProps}>
	{@render children?.()}
</div>
