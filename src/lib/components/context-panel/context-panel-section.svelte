<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** A named group of rows in the body — "Companies", "Tasks". */
	let {
		ref = $bindable(null),
		class: className,
		label,
		count,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>, HTMLElement> & {
		label: string;
		/** Shown beside the label when the group is worth counting. */
		count?: number;
		children?: Snippet;
	} = $props();
</script>

<section
	bind:this={ref}
	data-slot="context-panel-section"
	class={cn('flex flex-col gap-1', className)}
	{...restProps}
>
	<div class="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-medium">
		<span class="min-w-0 truncate">{label}</span>
		{#if count !== undefined}
			<span class="tabular-nums opacity-70">{count}</span>
		{/if}
	</div>
	{@render children?.()}
</section>
