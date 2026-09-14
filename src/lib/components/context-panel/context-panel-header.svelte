<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** The panel's one-line top: its name on the start side, its controls on the end. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="context-panel-header"
	class={cn('border-border flex h-11 shrink-0 items-center gap-2 border-b px-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
