<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { BADGE_TONE_TEXT_CLASSES, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { useKanban, useKanbanColumn } from './context.svelte.js';

	/**
	 * One status inside a split column — where a release actually lands. It is
	 * not a control: it exists only while a card is in the air over its column,
	 * and the keyboard reaches the same status with the arrow keys, so there is
	 * nothing here to focus.
	 */
	let {
		ref = $bindable(null),
		class: className,
		status,
		tone = 'neutral',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The status a card released here is moved to — what `onmove` is called with. */
		status: string;
		/** The status's own hue, so the zone lit up is the colour of what it writes. */
		tone?: BadgeTone;
	} = $props();

	const kanban = useKanban();
	const column = useKanbanColumn();
	const active = $derived(kanban.isOverStatus(status));
</script>

<div
	bind:this={ref}
	data-slot="kanban-drop-zone"
	data-active={active ? '' : undefined}
	class={cn(
		'bg-card text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs font-medium tracking-wide uppercase transition-colors',
		// Solid, and in the status's own colour, once a release would write it.
		'data-[active]:border-solid data-[active]:border-current data-[active]:ring-[3px]',
		active && BADGE_TONE_TEXT_CLASSES[tone],
		active && 'ring-current/20',
		className
	)}
	{@attach (el) => kanban.registerZone(column.value, status, el)}
	{...restProps}
>
	{@render children?.()}
</div>
