<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A list that comes in headings: a stack of groups, each of which opens and
	 * shuts. The page decides what a group IS — a due-date bucket, a category,
	 * a stage — and puts the rows inside it; nothing here groups anything.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="group-list"
	class={cn('flex flex-col gap-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
