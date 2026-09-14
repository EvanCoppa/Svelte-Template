<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTableRows } from './context.svelte.js';
	import { SUB_CELL, subDividerClass, type SubDivider } from './sub-rows.js';

	let {
		ref = $bindable(null),
		label,
		count,
		divider = 'section',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement> & {
		/** What the rows under this heading are — "Shipments", "Invoices". */
		label?: string;
		/** How many of them, shown after the label. */
		count?: number;
		/** The rule above this row; see `SubDivider`. Defaults to a section rule. */
		divider?: SubDivider;
		/** Said instead of the label — an open record with nothing under it. */
		children?: Snippet;
	} = $props();

	const rows = useDataTableRows();
</script>

<!--
	The heading over one run of nested rows, or the sentence an open record with
	nothing under it says. It spans the table rather than sitting in a column,
	so its text stays put while the columns scroll past (`sticky`).
-->
<tr bind:this={ref} data-slot="data-table-sub-section" class={className} {...restProps}>
	<Table.Cell
		colspan={rows.columns.length}
		class={cn(SUB_CELL, subDividerClass(divider), 'text-muted-foreground')}
	>
		<span class="sticky start-0 inline-block">
			{#if children}
				{@render children()}
			{:else}
				<span class="text-[11px] font-semibold tracking-wider uppercase">{label}</span>
				{#if count !== undefined}
					<span class="text-muted-foreground/70 tabular-nums">&nbsp;·&nbsp;{count}</span>
				{/if}
			{/if}
		</span>
	</Table.Cell>
</tr>
