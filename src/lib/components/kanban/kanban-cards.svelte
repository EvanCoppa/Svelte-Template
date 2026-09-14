<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useKanban, useKanbanColumn } from './context.svelte.js';

	/**
	 * The column's cards, and the gap a card hovering over the column opens up
	 * for itself. They step aside while `Kanban.Zones` is asking which status a
	 * release means — one column shows one thing at a time, or the question and
	 * the answer are on screen together and neither reads.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const kanban = useKanban();
	const column = useKanbanColumn();
</script>

{#if !kanban.splitting(column.value)}
	<div
		bind:this={ref}
		data-slot="kanban-cards"
		class={cn('flex flex-1 flex-col gap-2', className)}
		{...restProps}
	>
		{@render children?.()}
		{#if kanban.wouldTake(column.value)}
			<!-- Where the card would land, kept open while it is still in the air. -->
			<div
				data-slot="kanban-placeholder"
				class="border-primary/50 bg-primary/5 h-20 rounded-lg border-2 border-dashed"
			></div>
		{/if}
	</div>
{/if}
