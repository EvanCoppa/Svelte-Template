<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<tbody
	bind:this={ref}
	data-slot="table-body"
	class={cn(
		'[&_td]:border-border/60 [&_td]:border-b-2 [&_tr:first-child>td]:border-t-2 [&_tr:first-child>td:first-child]:rounded-tl-lg [&_tr:first-child>td:last-child]:rounded-tr-lg [&_tr:last-child>td]:border-b-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tbody>
