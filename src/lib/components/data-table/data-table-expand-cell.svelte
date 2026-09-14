<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	/**
	 * The slice of TanStack's `Row` API the chevron drives. Structural on
	 * purpose, for the reason `DataTable.ColumnHeader`'s `column` prop is:
	 * `renderComponent` erases a generic component's type parameters to their
	 * constraints, so a `Row<DataTableFeatures, TData>` prop would refuse every
	 * concretely-typed row at the call site.
	 */
	type ExpandableRow = {
		getCanExpand: () => boolean;
		getIsExpanded: () => boolean;
		toggleExpanded: (expanded?: boolean) => void;
	};

	let {
		row,
		label
	}: {
		row: ExpandableRow;
		/** What the row is, for the button's label: "Show shipments for ACME". */
		label: string;
	} = $props();

	const expanded = $derived(row.getIsExpanded());
</script>

<!--
	A row that cannot open leaves the cell empty rather than showing a dead
	control — the column is the same width either way, so the rows below still
	line up. `aria-expanded` is on the button and the rows it opens follow it in
	the table, which is where a reader lands next.
-->
{#if row.getCanExpand()}
	<button
		type="button"
		data-slot="data-table-expand"
		class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
		aria-expanded={expanded}
		aria-label="{expanded ? 'Hide' : 'Show'} {label}"
		onclick={() => row.toggleExpanded()}
	>
		<ChevronRightIcon
			class="size-4 transition-transform duration-200 {expanded ? 'rotate-90' : ''}"
		/>
	</button>
{/if}
