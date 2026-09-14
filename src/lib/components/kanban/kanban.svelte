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
		/** A card was released over a status other than its own. The page persists it. */
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
	style:min-height={kanban.dragging && kanban.frozenHeight !== null
		? `${String(kanban.frozenHeight)}px`
		: null}
	{@attach (el) => kanban.registerBoard(el)}
	{...restProps}
>
	{@render children?.()}
</div>

{#if kanban.dragging && kanban.carried}
	<!-- The card under the pointer: the lifted card's own content, drawn here
	     rather than by the card so that a column splitting into drop zones
	     cannot unmount the thing you are holding. `fixed`, and `inert` as well
	     as hidden — the content it borrows holds the card's own links, chips
	     and menus, and a picture of a card must not put a second copy of them
	     in the tab order. Every handler on it belongs to the card left behind. -->
	<div
		aria-hidden="true"
		inert
		data-slot="kanban-card-ghost"
		class="bg-card text-card-foreground pointer-events-none fixed z-50 flex w-64 flex-col gap-2 rounded-lg border p-3 text-sm shadow-lg"
		style="left: {kanban.pointer.x}px; top: {kanban.pointer
			.y}px; transform: translate(-50%, -50%) rotate(2deg)"
	>
		{@render kanban.carried()}
	</div>
{/if}

<!-- What the keyboard's move says out loud. One region for the board, because
     only one card is ever in the air. -->
<div aria-live="polite" class="sr-only">{kanban.spoken}</div>
