<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * What the card is, and the way through to the record. A link, because the
	 * card is a view of a row that has a page of its own — the press that opens
	 * it never becomes a drag, since a lift waits for the pointer to travel.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> = $props();
</script>

<a
	bind:this={ref}
	data-slot="kanban-card-title"
	class={cn(
		'text-foreground self-start font-medium underline-offset-4 hover:underline',
		'focus-visible:ring-ring/50 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</a>
