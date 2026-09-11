<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** What a group says when the page put no rows under it. */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	bind:this={ref}
	data-slot="group-list-empty"
	class={cn('text-muted-foreground px-3 py-6 text-center text-xs', className)}
	{...restProps}
>
	{@render children?.()}
</p>
