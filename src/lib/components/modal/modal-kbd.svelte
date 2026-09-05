<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<!-- The shortcut badge on the footer buttons; each button paints it for its own fill. -->
<kbd
	bind:this={ref}
	data-slot="modal-kbd"
	class={cn(
		'ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 font-sans text-[11px] leading-none font-medium',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
