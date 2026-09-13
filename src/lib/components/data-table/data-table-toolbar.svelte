<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The row over a table: the search box at the start, the filters after
	 * it, and whatever the page adds (`ViewOptions`, an export button) pushed
	 * to the end with `ms-auto`. One row that wraps on a narrow screen, and
	 * its own room below it so the controls never sit on the table's frame.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { children?: Snippet } = $props();
</script>

<div
	bind:this={ref}
	data-slot="data-table-toolbar"
	class={cn('flex flex-wrap items-center gap-2 pb-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
