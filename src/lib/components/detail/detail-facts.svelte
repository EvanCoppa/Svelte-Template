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

<!--
	The ways to reach the record — its email, phone, website, where it is —
	under its name as a contact card would put them. The rest of its fields
	fill the rail's details.
-->
<ul
	bind:this={ref}
	data-slot="detail-facts"
	class={cn('text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</ul>
