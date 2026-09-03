<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The slice of TanStack's `Column` API this header drives. Structural on
	 * purpose: `renderComponent` erases a generic component's type parameters to
	 * their constraints, so a `Column<DataTableFeatures, TData, TValue>` prop
	 * would refuse every concretely-typed column at the call site. None of these
	 * members mention the row type, so any column from the features preset
	 * assigns without a cast.
	 */
	type HeaderColumn = {
		getCanSort: () => boolean;
		getIsSorted: () => false | 'asc' | 'desc';
		toggleSorting: (desc?: boolean, isMulti?: boolean) => void;
	};

	let {
		ref = $bindable(null),
		column,
		title,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The column this header controls — handed in by the column def's `header` renderer. */
		column: HeaderColumn;
		title: string;
	} = $props();

	const sorted = $derived(column.getIsSorted());
</script>

<!--
	A sortable header is the whole cell: the label at the start, the direction
	pinned to the end, and a click cycling asc → desc → off. The arrow stays
	visible but faded when the column is unsorted, so every sortable column
	reads as one. Hiding a column is ViewOptions' job, not the header's.
-->
{#if !column.getCanSort()}
	<div bind:this={ref} data-slot="data-table-column-header" class={className} {...restProps}>
		{title}
	</div>
{:else}
	<div bind:this={ref} data-slot="data-table-column-header" class={className} {...restProps}>
		<button
			type="button"
			class={cn(
				'hover:text-foreground focus-visible:ring-ring/50 flex h-full w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left transition-colors outline-none focus-visible:ring-[3px]',
				sorted ? 'text-foreground' : 'text-foreground/80'
			)}
			aria-label="Sort by {title}"
			onclick={() => column.toggleSorting()}
		>
			<span>{title}</span>
			{#if sorted === 'desc'}
				<ArrowDownIcon class="size-3.5 shrink-0" />
			{:else}
				<ArrowUpIcon class={cn('size-3.5 shrink-0', !sorted && 'opacity-40')} />
			{/if}
		</button>
	</div>
{/if}
