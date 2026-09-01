<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { reducedMotion } from '$lib/motion.js';
	import AccordionRow from './accordion-row.svelte';
	import type { AccordionItem } from './accordion-row.svelte';

	export type AccordionType = 'single' | 'multiple';

	export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Rows to render. Each is { id, title, content?, meta? }; id must be stable. */
		items: AccordionItem[];
		/** Whether opening a row closes its siblings or leaves them alone. */
		type?: AccordionType;
		/** Uncontrolled starting open set. In single mode only the first id is honoured. */
		defaultOpen?: string[];
		/** The open set. Bindable; omit it and the accordion keeps its own. */
		open?: string[];
		/** Fires with the next open set on every toggle, bound or not. */
		onOpenChange?: (open: string[]) => void;
		/** In single mode, whether the open row can be clicked shut leaving nothing open. */
		collapsible?: boolean;
		/** Ceiling in pixels for a panel. Content past it scrolls inside, overscroll contained. */
		maxPanelHeight?: number;
		/** aria-level for the header wrapper, so the accordion slots into the document outline. */
		headingLevel?: number;
		/** Rich panel body. Rendered instead of `item.content`, once per row. */
		panel?: Snippet<[AccordionItem]>;
	}

	let {
		class: className,
		items,
		type = 'single',
		defaultOpen = [],
		open = $bindable(type === 'single' ? defaultOpen.slice(0, 1) : defaultOpen.slice()),
		onOpenChange,
		collapsible = true,
		maxPanelHeight = 220,
		headingLevel = 3,
		panel,
		...restProps
	}: AccordionProps = $props();

	const uid = $props.id();

	let headerEls: (HTMLButtonElement | undefined)[] = $state([]);

	const openSet = $derived(new Set(open ?? []));

	function commit(next: string[]) {
		open = next;
		onOpenChange?.(next);
	}

	function toggle(id: string) {
		const active = openSet.has(id);
		if (active && !collapsible && type === 'single') return;
		if (type === 'single') {
			commit(active ? [] : [id]);
			return;
		}
		commit(active ? (open ?? []).filter((entry) => entry !== id) : [...(open ?? []), id]);
	}

	function move(from: number, delta: number, edge: 'first' | 'last' | null) {
		const total = items.length;
		if (total === 0) return;
		const next =
			edge === 'first' ? 0 : edge === 'last' ? total - 1 : (from + delta + total) % total;
		headerEls[next]?.focus();
	}

	function onHeaderKeydown(event: KeyboardEvent, index: number) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(index, 1, null);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(index, -1, null);
		} else if (event.key === 'Home') {
			event.preventDefault();
			move(index, 0, 'first');
		} else if (event.key === 'End') {
			event.preventDefault();
			move(index, 0, 'last');
		}
	}
</script>

<div
	{...restProps}
	data-slot="accordion"
	class={cn(
		'divide-border border-border bg-card divide-y overflow-hidden rounded-[11px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
>
	{#each items as item, index (item.id)}
		<AccordionRow
			bind:el={headerEls[index]}
			{item}
			{panel}
			{headingLevel}
			{maxPanelHeight}
			open={openSet.has(item.id)}
			reduced={reducedMotion.current}
			headerId={`${uid}-header-${item.id}`}
			panelId={`${uid}-panel-${item.id}`}
			ontoggle={() => toggle(item.id)}
			onheaderkeydown={(event) => onHeaderKeydown(event, index)}
		/>
	{/each}
</div>
