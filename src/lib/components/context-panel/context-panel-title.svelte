<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** What the panel is about. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> = $props();
</script>

<h2
	bind:this={ref}
	data-slot="context-panel-title"
	class={cn('min-w-0 flex-1 truncate text-sm font-semibold', className)}
	{...restProps}
>
	{@render children?.()}
</h2>
