<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<!-- What the plan adds: the page loops over an `each` block rendering one `Feature` per row. -->
<ul
	bind:this={ref}
	data-slot="upgrade-card-features"
	class={cn('flex flex-col gap-4 px-6 pb-5', className)}
	{...restProps}
>
	{@render children?.()}
</ul>
