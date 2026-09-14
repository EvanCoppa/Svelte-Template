<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * One row of the panel. A link when it goes somewhere and plain text when
	 * it does not — a record the reader may not open still belongs in the list
	 * of what an answer drew on, it just is not a door.
	 */
	let {
		ref = $bindable(null),
		class: className,
		href,
		icon,
		detail,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> & {
		href?: string;
		/** A leading mark for what kind of thing this is. */
		icon?: Snippet;
		/** A quiet second column — a status, a count, a date. */
		detail?: string;
	} = $props();

	const shell =
		'flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground';
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="context-panel-item"
		{href}
		class={cn(shell, 'hover:bg-accent hover:text-accent-foreground transition-colors', className)}
		{...restProps}
	>
		{@render icon?.()}
		<span class="min-w-0 flex-1 truncate">{@render children?.()}</span>
		{#if detail}<span class="text-muted-foreground shrink-0 text-xs">{detail}</span>{/if}
	</a>
{:else}
	<div data-slot="context-panel-item" class={cn(shell, 'text-muted-foreground', className)}>
		{@render icon?.()}
		<span class="min-w-0 flex-1 truncate">{@render children?.()}</span>
		{#if detail}<span class="shrink-0 text-xs">{detail}</span>{/if}
	</div>
{/if}
