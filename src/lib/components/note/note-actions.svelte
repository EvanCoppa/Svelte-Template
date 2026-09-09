<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!--
	The strip along the bottom of a note: the palette and whatever that surface
	lets you do with it. A separate part because the dock, `/notes` and a record
	page each offer a different set, and none of them should restyle the row.
-->
<div
	bind:this={ref}
	data-slot="note-actions"
	class={cn('mt-auto flex items-center gap-1 pt-1 opacity-70', className)}
	{...restProps}
>
	{@render children?.()}
</div>
