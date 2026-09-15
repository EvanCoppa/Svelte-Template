<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The frame every artifact in the thread shares: a card on its own
	 * hairline with one header row — a mark for what kind of thing it is, its
	 * name, a quiet count or subtitle beside it, and whatever the artifact
	 * lets the reader do pushed to the end — over a body the artifact fills.
	 *
	 * An artifact is a tool's result drawn as a component rather than folded
	 * into the activity line (docs/assistant.md, "Artifacts"): a list page's
	 * table, a record's card, a map of connections, a pick-a-time card, a
	 * packing card, a change waiting for approval. The frame is only the
	 * frame — what it holds is the message's, passed in where it renders, so
	 * the thread reads as one column of things the assistant made rather than
	 * as six differently shaped widgets.
	 */
	let {
		ref = $bindable(null),
		class: className,
		icon: Icon,
		title,
		meta,
		actions,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** A lucide icon for what kind of artifact this is. */
		icon: Component<{ class?: string }>;
		title: string;
		/** A quiet second column beside the title — a count, a range, a status. */
		meta?: string;
		/** What the reader may do with it, on the end side of the header. */
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section
	bind:this={ref}
	data-slot="assistant-artifact"
	class={cn(
		'border-border bg-card text-card-foreground w-full overflow-hidden rounded-xl border shadow-xs',
		className
	)}
	{...restProps}
>
	<header class="border-border flex min-h-10 items-center gap-2 border-b px-3 py-1.5">
		<Icon class="text-muted-foreground size-4 shrink-0" />
		<h3 class="min-w-0 truncate text-sm font-medium">{title}</h3>
		{#if meta}
			<span class="text-muted-foreground shrink-0 text-xs tabular-nums">{meta}</span>
		{/if}
		{#if actions}
			<div class="ms-auto flex shrink-0 items-center gap-1">
				{@render actions()}
			</div>
		{/if}
	</header>
	<div data-slot="assistant-artifact-body" class="p-3">
		{@render children?.()}
	</div>
</section>
