<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** Everything under the header, scrolling on its own. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="context-panel-body"
	class={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
