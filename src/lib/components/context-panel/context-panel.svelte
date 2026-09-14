<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A panel of context docked beside the thing it is about: its own card,
	 * on its own hairline, with a header that names it and a body that
	 * scrolls. What a screen shows in it is the screen's business — the
	 * records an answer drew on, a record's details, a preview of what is
	 * about to be written — and the panel only supplies the frame.
	 *
	 * It hides itself below `lg`, where a docked card would leave the thing it
	 * is about too narrow to read; a screen that wants it at every width
	 * passes its own display classes.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>, HTMLElement> = $props();
</script>

<aside
	bind:this={ref}
	data-slot="context-panel"
	class={cn(
		'border-border bg-card hidden w-90 shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm lg:flex',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</aside>
