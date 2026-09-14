<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The line above the title: what the record is, on the start side, and
	 * whatever the page lets you do to it on the end side. On a grouped board
	 * the eyebrow is where a card says its own status — the column has only
	 * said the group, so "Blocked" under "In progress" is new information
	 * rather than the same word twice.
	 *
	 * The end side keeps clear of the drag handle, which is pinned to the
	 * card's top right corner and appears on hover.
	 */
	let {
		ref = $bindable(null),
		class: className,
		actions,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The end of the line — a menu, a badge, a count. */
		actions?: import('svelte').Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-card-header"
	class={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}
	{...restProps}
>
	{@render children?.()}
	{#if actions}
		<span class="ml-auto flex items-center gap-1 pr-5">{@render actions()}</span>
	{/if}
</div>
