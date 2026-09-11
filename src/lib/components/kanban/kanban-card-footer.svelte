<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The bottom line of a card: who is on it, and how much conversation it has
	 * collected. Separated by a dashed rule rather than a solid one — the card
	 * already has a border, and a second solid line inside it reads as two
	 * cards.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-card-footer"
	class={cn(
		'mt-0.5 flex items-center justify-between gap-2 border-t border-dashed pt-2',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
