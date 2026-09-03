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

<thead
	bind:this={ref}
	data-slot="table-header"
	class={cn(
		'[&_th]:bg-muted/60 [&_th:first-child]:rounded-bl-lg [&_th:last-child]:rounded-br-lg',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</thead>
