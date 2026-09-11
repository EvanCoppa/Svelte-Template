<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { setKanban, type KanbanMove } from './context.svelte.js';

	/**
	 * The board: a row of columns that scrolls sideways, and the drag state its
	 * parts share. The columns and the cards in them are the page's markup —
	 * this part owns only what a column cannot know on its own, which is where
	 * the pointer is and whose card is in the air.
	 */
	let {
		ref = $bindable(null),
		class: className,
		onmove,
		disabled = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** A card was released over another column. The page persists it. */
		onmove?: KanbanMove;
		/** Freezes the board: cards stop lifting and leave the tab order. */
		disabled?: boolean;
	} = $props();

	const kanban = setKanban({
		onmove: () => onmove,
		disabled: () => disabled
	});
</script>

<div
	bind:this={ref}
	data-slot="kanban"
	class={cn(
		// `items-stretch` so every column is as tall as the fullest: a board
		// with columns of four different heights reads as four lists, and an
		// empty column needs somewhere to drop a card.
		'flex items-stretch gap-4 overflow-x-auto overflow-y-visible px-1 pb-2',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

<!-- What the keyboard's move says out loud. One region for the board, because
     only one card is ever in the air. -->
<div aria-live="polite" class="sr-only">{kanban.spoken}</div>
