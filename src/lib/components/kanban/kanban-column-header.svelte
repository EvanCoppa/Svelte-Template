<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { BADGE_TONE_DOT_CLASSES, type BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The group's name, how many cards are under it, and whatever the page
	 * wants on the end of the line. The tone is one of the ten the app owns, so
	 * a column and the pill for the same value are the same hue, and the rule
	 * under the header carries it too — the one thing that tells four grey
	 * columns apart at a glance.
	 *
	 * `lead` replaces the dot for a column that wants a richer mark, which on
	 * the task board is the status ring the cards also wear.
	 */
	let {
		ref = $bindable(null),
		class: className,
		tone = 'neutral',
		count,
		lead,
		actions,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		tone?: BadgeTone;
		/** How many cards the page put in this column. */
		count?: number;
		/** The mark before the name. Without it, a dot in the column's tone. */
		lead?: import('svelte').Snippet;
		/** The end of the header line — an "Add" button, a menu. */
		actions?: import('svelte').Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-column-header"
	class={cn('flex flex-col gap-1.5', className)}
	{...restProps}
>
	<div class="flex items-center gap-2 px-1.5 pt-1">
		{#if lead}
			{@render lead()}
		{:else}
			<span class={cn('size-2 shrink-0 rounded-full', BADGE_TONE_DOT_CLASSES[tone])}></span>
		{/if}
		<span class="truncate text-sm font-medium">{@render children?.()}</span>
		{#if count !== undefined}
			<span
				class="text-muted-foreground bg-background rounded-full border px-1.5 py-0.5 text-xs tabular-nums"
			>
				{count}
			</span>
		{/if}
		{#if actions}
			<span class="ml-auto flex items-center">{@render actions()}</span>
		{/if}
	</div>
	<span class={cn('mx-0.5 h-0.5 rounded-full opacity-80', BADGE_TONE_DOT_CLASSES[tone])}></span>
</div>
