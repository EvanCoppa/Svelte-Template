<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The island the board's controls sit on: what the pointer does, what it
	 * draws in, and what to do with what is already there. The page fills it —
	 * `Whiteboard.Tool`, `Whiteboard.Swatch` and any `ui/` control — and a
	 * `ui/separator` divides the groups.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="whiteboard-toolbar"
	class={cn('bg-card flex flex-wrap items-center gap-1 rounded-lg border p-1 shadow-xs', className)}
	{...restProps}
>
	{@render children?.()}
</div>
