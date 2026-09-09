<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!--
	The surface the grid is drawn on: one framed card that takes whatever
	height the page gives it, so a month's rows and a week's hours size
	themselves to the room rather than to the number of events.
-->
<div
	bind:this={ref}
	data-slot="calendar"
	class={cn(
		'bg-card text-card-foreground flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-xs',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
