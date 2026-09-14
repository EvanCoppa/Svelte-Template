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

<!--
	What the record IS, beside the tabs and unchanged by them: a panel on a
	hairline rather than a card, so the page has one frame.
-->
<aside
	bind:this={ref}
	data-slot="detail-rail"
	class={cn('space-y-6 xl:sticky xl:top-4 xl:border-l xl:pl-6', className)}
	{...restProps}
>
	{@render children?.()}
</aside>
