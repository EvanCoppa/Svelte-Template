<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { setKanbanColumn, useKanban, type KanbanStatus } from './context.svelte.js';

	/**
	 * One column — a **status group**: the coarse state a reader scans for, and
	 * the one or more fine statuses that live under it. A column holding a
	 * single status is the plain case and takes a release straight away; a
	 * column holding several asks which one, by splitting into `Kanban.Zones`
	 * while a card is over it.
	 *
	 * `value` is the group's own id and never reaches `onmove` — what a move
	 * writes is always a status, because a group is a way of reading the board
	 * rather than a state a record can be in.
	 */
	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		statuses,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The group's id. Names the column to the board's parts, nothing more. */
		value: string;
		/** What to call it out loud — the same words the header shows. */
		label: string;
		/**
		 * The states under this column, in the order they are shown. One is the
		 * plain column; several make it split. The board reads this for the
		 * order the arrow keys walk and for what it announces, so it wants the
		 * label as well as the value — keep the array stable (a module-level
		 * constant, or a `$derived`), not rebuilt on every render.
		 */
		statuses: readonly KanbanStatus[];
		children?: import('svelte').Snippet;
	} = $props();

	const kanban = useKanban();
	setKanbanColumn(() => value);
</script>

<div
	bind:this={ref}
	data-slot="kanban-column"
	data-over={kanban.isOver(value) ? '' : undefined}
	class={cn(
		// Wide enough to read a title, and free to grow: a board of four
		// columns should fill the screen rather than leave a gutter, while a
		// board of ten still scrolls sideways instead of squeezing.
		'bg-muted/40 flex min-h-48 min-w-56 flex-1 flex-col gap-2 rounded-xl border p-2 transition-colors',
		// Where a release would land, said plainly rather than with a shadow:
		// the board is already a field of cards.
		'data-[over]:border-primary data-[over]:bg-primary/5',
		className
	)}
	{@attach (el) => kanban.registerColumn(value, el, label, () => statuses)}
	{...restProps}
>
	{@render children?.()}
</div>
