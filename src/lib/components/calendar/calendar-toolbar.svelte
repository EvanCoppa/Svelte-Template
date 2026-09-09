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
	The line between the page heading and the grid: today, the arrows and the
	span on screen on the start side, the view switch on the end side. The
	page fills it; this only lays it out.
-->
<div
	bind:this={ref}
	data-slot="calendar-toolbar"
	class={cn('flex flex-wrap items-center justify-between gap-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
