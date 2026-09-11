<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { BADGE_TONE_DOT_CLASSES, type BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The column's name, how many cards are under it, and whatever the page
	 * wants on the end of the line. The tone is one of the ten the app owns, so
	 * a column and the pill for the same value are the same hue.
	 */
	let {
		ref = $bindable(null),
		class: className,
		tone = 'neutral',
		count,
		actions,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		tone?: BadgeTone;
		/** How many cards the page put in this column. */
		count?: number;
		/** The end of the header line — an "Add" button, a menu. */
		actions?: import('svelte').Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-column-header"
	class={cn('flex items-center gap-2 px-1.5 py-1', className)}
	{...restProps}
>
	<span class={cn('size-2 shrink-0 rounded-full', BADGE_TONE_DOT_CLASSES[tone])}></span>
	<span class="truncate text-sm font-medium">{@render children?.()}</span>
	{#if count !== undefined}
		<span class="text-muted-foreground text-xs tabular-nums">{count}</span>
	{/if}
	{#if actions}
		<span class="ml-auto flex items-center">{@render actions()}</span>
	{/if}
</div>
