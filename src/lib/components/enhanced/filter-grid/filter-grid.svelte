<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Attachment } from 'svelte/attachments';
	import { cn } from '$lib/utils.js';
	import { motionFlip, motionTo, motionTransition } from '$lib/motion.js';

	/** The chip thumb travelling between filters. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Cards moving to a new slot, and the labels swapping inside a chip. */
	const MOVE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];

	export type FilterDefinition<Item> = {
		id: string;
		label: string;
		match: (item: Item) => boolean;
	};

	export interface FilterGridProps<Item> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The full unfiltered set. Its length fixes the reserved height, so it must not depend on the active filter. */
		items: readonly Item[];
		/** Each entry is { id, label, match }. Include an "all" entry whose match returns true. */
		filters: readonly FilterDefinition<Item>[];
		/** Stable identity per item. A key that changes between filters turns a move into a remount. */
		getKey: (item: Item) => string;
		/** Cell contents only. The component owns the card chrome, the radius and the fixed row height. */
		item: Snippet<[Item]>;
		/** Accessible name for the filter radiogroup. */
		label: string;
		/** Active filter id. Bindable. */
		value?: string;
		/** Initial filter id when not bound. */
		defaultValue?: string;
		/** Fires only when the active id actually changes, never on a re-click of the current filter. */
		onValueChange?: (id: string) => void;
		/** Fixed column count — a number, not a breakpoint, because the reserved height derives from it. */
		columns?: number;
		/** Row height in px, fixed so the grid's height is known before the first paint. */
		rowHeight?: number;
		/** Height cap in rows. Beyond it the grid scrolls internally instead of growing. */
		maxRows?: number;
		/** Gap in px between cells, counted into the reserved height. */
		gap?: number;
		/** Shown centred in the reserved space when a filter matches nothing. */
		emptyLabel?: string;
	}

	let {
		class: className,
		items,
		filters,
		getKey,
		item,
		label,
		defaultValue,
		value = $bindable(defaultValue),
		onValueChange,
		columns = 3,
		rowHeight = 72,
		maxRows = 4,
		gap = 8,
		emptyLabel = 'Nothing matches this filter',
		...restProps
	}: FilterGridProps<T> = $props();

	const uid = $props.id();
	const gridId = `${uid}-grid`;

	const active = $derived.by(() => {
		const requested = value ?? filters[0]?.id ?? '';
		return (filters.find((f) => f.id === requested) ?? filters[0])?.id ?? '';
	});
	const activeLabel = $derived(filters.find((f) => f.id === active)?.label ?? '');

	const counts = $derived.by(() => {
		const next: Record<string, number> = {};
		for (const filter of filters) {
			let n = 0;
			for (const entry of items) if (filter.match(entry)) n += 1;
			next[filter.id] = n;
		}
		return next;
	});

	const visible = $derived.by(() => {
		const filter = filters.find((f) => f.id === active);
		if (!filter) return [...items];
		return items.filter((entry) => filter.match(entry));
	});

	const total = $derived(items.length);

	let gridEl: HTMLUListElement | undefined = $state();
	let chipEls: (HTMLButtonElement | null)[] = $state([]);
	let heldFocus = false;

	const cols = $derived(Math.max(1, Math.floor(columns)));
	const rows = $derived(Math.min(Math.max(1, Math.ceil(total / cols)), Math.max(1, maxRows)));
	const box = $derived(rows * rowHeight + (rows - 1) * gap);
	const capped = $derived(Math.ceil(total / cols) > Math.max(1, maxRows));

	const index = $derived(
		Math.max(
			0,
			filters.findIndex((f) => f.id === active)
		)
	);

	function select(id: string) {
		const previous = active;
		value = id;
		if (id !== previous) onValueChange?.(id);
	}

	function choose(id: string) {
		const grid = gridEl;
		heldFocus = !!grid && grid.contains(document.activeElement) && grid !== document.activeElement;
		select(id);
	}

	function settle() {
		if (!heldFocus) return;
		heldFocus = false;
		const grid = gridEl;
		if (grid && !grid.contains(document.activeElement)) grid.focus();
	}

	function go(i: number) {
		const at = (i + filters.length) % filters.length;
		const next = filters[at];
		if (!next) return;
		chipEls[at]?.focus();
		choose(next.id);
	}

	function onKeyDown(e: KeyboardEvent, i: number) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			go(i + 1);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			go(i - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			go(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			go(filters.length - 1);
		}
	}

	// One thumb for the whole row rather than one per chip, so the lit background
	// travels between filters instead of being redrawn under the new one.
	let thumb = $state({ x: 0, y: 0, width: 0, height: 0, ready: false });

	function measureThumb() {
		const node = chipEls[index];
		if (!node) return;
		thumb = {
			x: node.offsetLeft,
			y: node.offsetTop,
			width: node.offsetWidth,
			height: node.offsetHeight,
			ready: true
		};
	}

	$effect(() => {
		void index;
		void filters;
		void counts;
		measureThumb();
	});

	const observeChips: Attachment<HTMLElement> = (node) => {
		const observer = new ResizeObserver(() => measureThumb());
		observer.observe(node);
		return () => observer.disconnect();
	};

	/**
	 * Exit like Motion's popLayout: pull the card out of flow at the position it
	 * currently occupies, so the surviving cards travel to their new slots
	 * underneath it rather than waiting for it to finish leaving.
	 */
	function popOut(node: HTMLElement) {
		Object.assign(node.style, {
			position: 'absolute',
			margin: '0',
			left: `${node.offsetLeft}px`,
			top: `${node.offsetTop}px`,
			width: `${node.offsetWidth}px`,
			height: `${node.offsetHeight}px`
		});
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.98 },
			transition: { duration: 0.14, ease: LEAVE }
		});
	}
</script>

<div {...restProps} class={cn('w-full', className)}>
	<div
		role="radiogroup"
		aria-label={label}
		aria-controls={gridId}
		class="relative flex flex-wrap items-center gap-1.5"
		{@attach observeChips}
	>
		{#if thumb.ready}
			<span
				aria-hidden="true"
				class="bg-primary pointer-events-none absolute top-0 left-0 rounded-[6px]"
				{@attach motionTo(() => ({
					keyframes: {
						x: thumb.x,
						y: thumb.y,
						width: thumb.width,
						height: thumb.height
					},
					transition: CELL
				}))}
			></span>
		{/if}
		{#each filters as filter, i (filter.id)}
			{@const on = i === index}
			<button
				bind:this={chipEls[i]}
				type="button"
				role="radio"
				aria-checked={on}
				tabindex={on ? 0 : -1}
				onclick={() => choose(filter.id)}
				onkeydown={(e) => onKeyDown(e, i)}
				class="group relative inline-grid h-8 touch-manipulation place-items-center rounded-[6px] px-3 outline-none select-none focus-visible:shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
			>
				<span
					aria-hidden="true"
					class={cn(
						'group-focus-visible:border-ring pointer-events-none absolute inset-0 rounded-[6px] border',
						on ? 'border-transparent' : 'border-border'
					)}
				></span>
				<span class="relative col-start-1 row-start-1 inline-grid">
					<span
						aria-hidden="true"
						class="text-foreground col-start-1 row-start-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap"
						{@attach motionTo(() => ({ keyframes: { opacity: on ? 0 : 1 }, transition: MOVE }))}
					>
						{filter.label}
						<span class="text-muted-foreground text-[10.5px] tabular-nums">
							{counts[filter.id]}
						</span>
					</span>
					<span
						aria-hidden="true"
						class="text-primary-foreground col-start-1 row-start-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap"
						{@attach motionTo(() => ({ keyframes: { opacity: on ? 1 : 0 }, transition: MOVE }))}
					>
						{filter.label}
						<span class="text-[10.5px] tabular-nums opacity-70">
							{counts[filter.id]}
						</span>
					</span>
					<span class="sr-only">{filter.label}, {counts[filter.id]} of {total}</span>
				</span>
			</button>
		{/each}
	</div>
	<div class="relative mt-2.5">
		<ul
			id={gridId}
			bind:this={gridEl}
			tabindex="-1"
			class={cn(
				'relative grid overflow-y-auto overscroll-contain outline-none',
				capped && '[scrollbar-gutter:stable]'
			)}
			style:grid-template-columns={`repeat(${cols}, minmax(0, 1fr))`}
			style:grid-auto-rows={`${rowHeight}px`}
			style:gap={`${gap}px`}
			style:height={`${box}px`}
		>
			{#each visible as entry (getKey(entry))}
				<li
					animate:motionFlip={{ transition: MOVE }}
					in:motionTransition={{
						keyframes: { opacity: [0, 1], scale: [0.97, 1] },
						transition: { duration: 0.2, ease: EASE }
					}}
					out:popOut
					onoutroend={settle}
					class="border-border bg-card min-w-0 overflow-hidden rounded-[11px] border p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]"
				>
					{@render item(entry)}
				</li>
			{/each}
		</ul>
		{#if visible.length === 0}
			<div
				in:motionTransition={{
					keyframes: { opacity: [0, 1] },
					transition: { duration: 0.2, ease: EASE }
				}}
				out:motionTransition={{
					keyframes: { opacity: 0 },
					transition: { duration: 0.14, ease: LEAVE }
				}}
				class="pointer-events-none absolute inset-0 grid place-items-center"
			>
				<span class="text-muted-foreground text-[12.5px]">{emptyLabel}</span>
			</div>
		{/if}
	</div>
	<p aria-live="polite" class="sr-only">{activeLabel}: {visible.length} of {total} shown</p>
</div>
