<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** The header's end side: whatever this panel lets you do to it. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="context-panel-actions"
	class={cn('text-muted-foreground flex shrink-0 items-center gap-0.5', className)}
	{...restProps}
>
	{@render children?.()}
</div>
