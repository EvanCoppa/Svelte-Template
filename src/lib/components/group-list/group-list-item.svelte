<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * One row under a heading: something on the left that acts on the record (a
	 * checkbox, a status ring), the record itself in the middle, and whatever
	 * the page offers on the right.
	 *
	 * The row is a container, never a control — the title inside it is the
	 * link, so the actions in `lead` and `trail` are real buttons rather than
	 * clicks fighting a click on the row.
	 */
	let {
		ref = $bindable(null),
		class: className,
		lead,
		trail,
		muted = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		lead?: Snippet;
		trail?: Snippet;
		/** Dims the row — a task that is done, a note that is archived. */
		muted?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="group-list-item"
	data-muted={muted ? '' : undefined}
	class={cn(
		'hover:bg-accent/40 flex items-start gap-3 px-3 py-2.5 transition-colors data-[muted]:opacity-60',
		className
	)}
	{...restProps}
>
	{#if lead}
		<div class="flex shrink-0 items-center pt-0.5">{@render lead()}</div>
	{/if}
	<div class="min-w-0 flex-1">{@render children?.()}</div>
	{#if trail}
		<div class="flex shrink-0 items-center gap-1">{@render trail()}</div>
	{/if}
</div>
