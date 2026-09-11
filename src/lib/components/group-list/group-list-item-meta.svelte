<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** The line under the title: pills, a date, who it is for. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="group-list-item-meta"
	class={cn(
		'text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
