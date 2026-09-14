<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A strip of open things across the top of a pane — the browser's tab bar
	 * rather than `ui/tabs`. Reach for it when each tab is a **document the
	 * reader opened** and can close: a conversation, a record, a draft. Reach
	 * for `ui/tabs` when the tabs switch between panels of one screen, which
	 * is a different job with different semantics (an ARIA tablist).
	 *
	 * The page owns what is open, which one is current, and what opening or
	 * closing one does.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>, HTMLElement> = $props();
</script>

<div
	bind:this={ref}
	data-slot="tab-strip"
	class={cn(
		'border-border flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b px-2',
		'[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
