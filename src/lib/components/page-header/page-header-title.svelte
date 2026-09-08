<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<!-- The one `<h1>` on the page, and the same words the `pages` row titles it with. -->
<h1
	bind:this={ref}
	data-slot="page-header-title"
	class={cn('text-2xl font-bold tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</h1>
