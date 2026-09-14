<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Table from '$lib/components/ui/table/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useDataTableRows } from './context.svelte.js';
	import { SUB_CELL, subDividerClass, type SubDivider } from './sub-rows.js';

	let {
		ref = $bindable(null),
		divider = 'row',
		class: className,
		cell,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement> & {
		/** The rule above this row; see `SubDivider`. */
		divider?: SubDivider;
		/**
		 * One cell of the row, drawn once per column on screen and handed that
		 * column's id. Say nothing for a column this row has no value for and
		 * the cell stays empty — the row still spans the table, so the columns
		 * below it line up.
		 */
		cell?: Snippet<[string]>;
	} = $props();

	const rows = useDataTableRows();
</script>

<!--
	One nested row of an open record: a real `<tr>` over the parent table's
	columns, so a shipment's carrier lands under the column that names things
	and its amount under Total. Plain rather than `Table.Row` on purpose — a
	nested row is part of the record above it, not a row to hover and select.
-->
<tr
	bind:this={ref}
	data-slot="data-table-sub-row"
	class={cn('transition-colors', className)}
	{...restProps}
>
	{#each rows.columns as columnId, index (columnId)}
		<Table.Cell
			data-pinned={rows.pinnedClass(index, 'sub') ? 'true' : undefined}
			style={rows.pinnedStyle(index)}
			class={cn(
				SUB_CELL,
				columnId === 'expand' && 'w-8 ps-3 pe-0',
				columnId === 'select' && 'w-8 ps-3 pe-0',
				columnId === 'actions' && 'w-8 pe-3',
				subDividerClass(divider),
				rows.pinnedClass(index, 'sub')
			)}
		>
			{@render cell?.(columnId)}
		</Table.Cell>
	{/each}
</tr>
