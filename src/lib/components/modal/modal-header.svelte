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

<!-- `pe-14` keeps the title clear of the close button `Modal.Card` pins to its corner. -->
<div
	bind:this={ref}
	data-slot="modal-header"
	class={cn('flex flex-col gap-1.5 ps-6 pe-14 pt-5 pb-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
