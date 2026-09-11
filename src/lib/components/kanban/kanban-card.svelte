<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useKanban } from './context.svelte.js';

	/**
	 * One card. The page fills it with whatever the record is; the shell
	 * handles being picked up.
	 *
	 * The card itself is not a control — it holds links and buttons, and a
	 * focusable box wrapped around those is a tab stop that announces nothing
	 * and swallows the keys the things inside it need. The **handle** is the
	 * control: a real button, in the tab order, that carries the keyboard's way
	 * across the board. A pointer may still drag from anywhere on the card,
	 * because a pointer has no tab order to confuse.
	 *
	 * While it is in the air the same content is drawn a second time under the
	 * pointer, so what you are carrying is the card rather than an outline of
	 * it.
	 */
	let {
		ref = $bindable(null),
		class: className,
		id,
		column,
		label,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The record's id — what `onmove` is called with. */
		id: string;
		/** The column it sits in now, so a release can tell a move from a drop back. */
		column: string;
		/** What to call it out loud while the keyboard is carrying it. */
		label: string;
	} = $props();

	const kanban = useKanban();
	const dragging = $derived(kanban.isDragging(id));
	const grabbed = $derived(kanban.grabbed === id);
</script>

<div
	bind:this={ref}
	data-slot="kanban-card"
	data-dragging={dragging ? '' : undefined}
	data-grabbed={grabbed ? '' : undefined}
	class={cn(
		'group/card bg-card text-card-foreground relative flex touch-none flex-col gap-2 rounded-lg border p-3 text-sm shadow-xs',
		kanban.disabled ? 'cursor-default' : 'cursor-grab',
		// The original stays in place as the hole the card came out of.
		'data-[dragging]:cursor-grabbing data-[dragging]:opacity-40',
		'data-[grabbed]:border-primary data-[grabbed]:ring-primary/40 data-[grabbed]:ring-2',
		className
	)}
	onpointerdown={(event) => kanban.press(event, id, column)}
	{...restProps}
>
	{#if !kanban.disabled}
		<button
			type="button"
			data-kanban-handle
			class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1.5 right-1.5 cursor-grab rounded opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:outline-none"
			aria-label="Move {label}"
			aria-roledescription="Drag handle"
			aria-keyshortcuts="Space ArrowLeft ArrowRight Escape"
			onkeydown={(event) => kanban.keydown(event, id, column, label)}
		>
			<GripVerticalIcon class="size-4" />
		</button>
	{/if}
	{@render children?.()}
</div>

{#if dragging}
	<!-- The card under the pointer. `fixed` and inert: it is a picture of the
	     card, and every handler on it belongs to the one left behind. -->
	<div
		aria-hidden="true"
		data-slot="kanban-card-ghost"
		class="bg-card text-card-foreground pointer-events-none fixed z-50 flex w-64 flex-col gap-2 rounded-lg border p-3 text-sm shadow-lg"
		style="left: {kanban.pointer.x}px; top: {kanban.pointer
			.y}px; transform: translate(-50%, -50%) rotate(2deg)"
	>
		{@render children?.()}
	</div>
{/if}
