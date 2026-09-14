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
	The top of a record page: the way back, then who the record is and how to
	reach it, with whatever this page lets you do on the end side. Not
	`PageHeader` — a record is not named by a `pages` row, it is named by
	itself, so the heading here is the record's own name.
-->
<div
	bind:this={ref}
	data-slot="detail-header"
	class={cn('flex min-w-0 flex-wrap items-start gap-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
