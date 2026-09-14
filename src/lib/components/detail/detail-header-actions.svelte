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

<!-- What this record page lets you do, pushed to the end of the header line. -->
<div
	bind:this={ref}
	data-slot="detail-header-actions"
	class={cn('ms-auto flex flex-wrap items-center gap-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
