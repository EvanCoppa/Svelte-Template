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

<!-- Cancel sits at the start, the primary action at the end: `<Modal.Cancel>` then `<Modal.Action>`. -->
<div
	bind:this={ref}
	data-slot="modal-footer"
	class={cn(
		'bg-muted/50 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
