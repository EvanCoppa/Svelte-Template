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

<!-- `Action` across the full width, then `Dismiss` centred under it. -->
<div
	bind:this={ref}
	data-slot="upgrade-card-footer"
	class={cn('flex flex-col items-center gap-3 px-6 pb-5', className)}
	{...restProps}
>
	{@render children?.()}
</div>
