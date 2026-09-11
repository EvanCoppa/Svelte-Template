<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * What the row is. A link when the record has a page, plain text when it
	 * does not — one part either way, so a row reads the same on both.
	 */
	let {
		ref = $bindable(null),
		class: className,
		href,
		struck = false,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> & {
		/** Strikes the title through: the record is done or closed. */
		struck?: boolean;
	} = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		{href}
		data-slot="group-list-item-title"
		class={cn(
			'block truncate text-sm font-medium underline-offset-4 hover:underline',
			struck && 'line-through',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<span
		data-slot="group-list-item-title"
		class={cn('block truncate text-sm font-medium', struck && 'line-through', className)}
	>
		{@render children?.()}
	</span>
{/if}
