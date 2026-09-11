<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useKanban } from './context.svelte.js';

	/**
	 * One column, and the drop zone it registers. `value` is what a card
	 * released here is moved to — a status, a stage, a bucket; the board never
	 * looks inside it.
	 */
	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** What this column means. Handed back to `onmove` on a release. */
		value: string;
		/** What to call it out loud — the same words the header shows. */
		label: string;
	} = $props();

	const kanban = useKanban();
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
	{@attach (el) => kanban.registerColumn(value, el, label)}
	{...restProps}
>
	{@render children?.()}
</div>
