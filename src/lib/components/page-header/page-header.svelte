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
	The top of every screen in the shell: the page's name on the start side and
	whatever it lets you do on the end side, on one line. There is no subtitle
	part on purpose — a page is named once, by its `pages` row, and the heading
	repeats that name rather than explaining it.
-->
<div
	bind:this={ref}
	data-slot="page-header"
	class={cn('flex flex-wrap items-center justify-between gap-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
