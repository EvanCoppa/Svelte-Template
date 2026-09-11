<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { BADGE_TONE_DOT_CLASSES, type BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The bar that names a group and opens it. The whole of the left side is
	 * the trigger; `actions` sits beside it rather than inside, because a
	 * button inside a button is neither valid nor clickable.
	 *
	 * `count` is a string on purpose — "3 tasks" and "3 quotes" are the same
	 * count in different words, and which words those are is the page's to
	 * know (see `recordTerms`), never this component's.
	 */
	let {
		ref = $bindable(null),
		class: className,
		tone,
		count,
		actions,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** A dot in one of the ten tones, for a group that stands for a state. */
		tone?: BadgeTone;
		/** How many rows are under the heading, in the page's own words. */
		count?: string;
		/** The end of the bar — an "Add" button, a menu. */
		actions?: Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="group-list-header"
	class={cn('flex items-center gap-1 pr-2', className)}
	{...restProps}
>
	<Collapsible.Trigger
		class="group/trigger hover:bg-accent/50 focus-visible:ring-ring/50 flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
	>
		<ChevronDownIcon
			class="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=closed]/trigger:-rotate-90"
		/>
		{#if tone}
			<span class={cn('size-2 shrink-0 rounded-full', BADGE_TONE_DOT_CLASSES[tone])}></span>
		{/if}
		<span class="truncate text-sm font-semibold">{@render children?.()}</span>
		{#if count}
			<span class="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">{count}</span>
		{/if}
	</Collapsible.Trigger>
	{#if actions}
		{@render actions()}
	{/if}
</div>
