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

<!-- What the page lets you do, pushed to the end of the heading line. -->
<div
	bind:this={ref}
	data-slot="page-header-actions"
	class={cn('flex flex-wrap items-center gap-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
