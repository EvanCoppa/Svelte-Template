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

<!--
	Sits on the tray below the card. Cancel at the start, the primary action at
	the end: `<Modal.Cancel>` then `<Modal.Action>`. The tray's own padding
	supplies the last few pixels, so the buttons end up evenly inset.
-->
<div
	bind:this={ref}
	data-slot="modal-footer"
	class={cn('flex flex-wrap items-center justify-between gap-3 px-2 pt-3 pb-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
