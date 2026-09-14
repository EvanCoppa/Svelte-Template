<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useKanban, useKanbanColumn } from './context.svelte.js';

	/**
	 * The column's statuses, shown in place of its cards while a card is over
	 * it — the answer to the question a grouped column cannot avoid asking.
	 *
	 * It renders nothing the rest of the time, and nothing at all in a column
	 * holding one status: there the column IS the status and a release needs no
	 * second decision. The zones themselves are the page's markup, because what
	 * a status is called and what colour it wears is the page's to know.
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

{#if kanban.splitting(column.value)}
	<div
		bind:this={ref}
		data-slot="kanban-zones"
		class={cn('flex min-h-56 flex-1 flex-col gap-2', className)}
		{...restProps}
	>
		{@render children?.()}
	</div>
{/if}
