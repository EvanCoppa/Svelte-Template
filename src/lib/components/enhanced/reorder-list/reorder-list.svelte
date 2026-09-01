<script lang="ts" generics="T">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SvelteMap } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';
	import { motionFlip, motionTo, reducedMotion } from '$lib/motion.js';

	/** Rows settling into a new order, and the lifted row swelling under the grab. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	export interface ReorderListProps<Item> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The list, in its current order. The component never owns the data. */
		items: readonly Item[];
		/** Stable identity per row. Keys, focus and announcements all hang off it. */
		getId: (item: Item) => string;
		/** What the screen reader calls the row while it moves. */
		getLabel: (item: Item) => string;
		/** Fires live as the order changes, once per crossing, so the gap can follow the drag. */
		onReorder: (next: Item[]) => void;
		/** Fires once when the drag drops or a keyboard move lands. The one to persist from. */
		onCommit?: (next: Item[]) => void;
		/** The row's content. The grip, lift and focus are already handled around it. */
		children: Snippet<[Item]>;
		/** Accessible name of the list. */
		label: string;
		/** Freezes the order and takes the rows out of the tab order. */
		disabled?: boolean;
	}

	/** CELL { stiffness: 520, damping: 34, mass: 0.45 } is a ~260ms settle. */
	const CELL_MS = 260;
	/** Pixels of travel before a press becomes a lift, so a click still focuses the row. */
	const LIFT = 3;
	/** Fallback gap between rows, in px, when the list is too short to measure one. */
	const GAP = 6;

	let {
		class: className,
		items,
		getId,
		getLabel,
		onReorder,
		onCommit,
		children,
		label,
		disabled = false,
		...restProps
	}: ReorderListProps<T> = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	let listEl = $state<HTMLUListElement | null>(null);
	/** The row the keyboard is carrying. */
	let grabbed = $state<string | null>(null);
	/** The row the pointer has lifted off the surface. */
	let dragging = $state<string | null>(null);
	/** True while a dropped row glides back into its slot. */
	let settling = $state(false);
	let offset = $state(0);
	let spoken = $state('');

	/** The order from before the grab, so Escape can put everything back. */
	let snapshot: T[] | null = null;
	let armed: string | null = null;
	/** True only while a pointer drag is live, so a drop can never be handled twice. */
	let active = false;
	let pointerStart = 0;
	let originTop = 0;
	let gap = GAP;
	let heights = new SvelteMap<string, number>();
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (settleTimer) clearTimeout(settleTimer);
	});

	function moveItem<V>(list: readonly V[], from: number, to: number): V[] {
		const next = [...list];
		const [taken] = next.splice(from, 1);
		next.splice(to, 0, taken);
		return next;
	}

	function indexOf(id: string) {
		return items.findIndex((item) => getId(item) === id);
	}

	function idsOf() {
		return items.map(getId);
	}

	/** Rebuilds the item list from an order of ids, so the emitted array is always real items. */
	function toItems(order: string[]): T[] {
		const byId = new Map(items.map((item) => [getId(item), item] as const));
		const next: T[] = [];
		for (const id of order) {
			const item = byId.get(id);
			if (item !== undefined) next.push(item);
		}
		return next;
	}

	/** Top of slot `index` relative to the list, from the heights measured at lift. */
	function slotTop(index: number, order: string[]) {
		let y = 0;
		for (let i = 0; i < index; i += 1) y += (heights.get(order[i]) ?? 0) + gap;
		return y;
	}

	function announce(id: string, phrase: (label: string, at: number, total: number) => string) {
		const at = indexOf(id);
		const item = items[at];
		if (item === undefined) return;
		spoken = phrase(getLabel(item), at + 1, items.length);
	}

	// --- keyboard ---------------------------------------------------------

	function grab(id: string) {
		snapshot = [...items];
		grabbed = id;
		announce(id, (name, at, total) => `${name} grabbed, position ${at} of ${total}.`);
	}

	function drop(id: string) {
		snapshot = null;
		grabbed = null;
		announce(id, (name, at) => `${name} dropped at position ${at}.`);
		onCommit?.([...items]);
	}

	function cancel() {
		if (snapshot) onReorder([...snapshot]);
		snapshot = null;
		grabbed = null;
		spoken = 'Reorder cancelled, original order restored.';
	}

	function step(id: string, delta: -1 | 1) {
		const from = indexOf(id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= items.length) return;
		const next = moveItem(items, from, to);
		onReorder(next);
		const item = next[to];
		spoken = `${getLabel(item)}, position ${to + 1} of ${next.length}.`;
		// A move made outside a grab has already landed, so it commits immediately.
		if (snapshot === null) onCommit?.(next);
	}

	function rowKeyDown(
		event: KeyboardEvent & { currentTarget: EventTarget & HTMLLIElement },
		id: string
	) {
		if (disabled || event.target !== event.currentTarget) return;
		const held = grabbed === id;

		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (held) drop(id);
			else grab(id);
			return;
		}
		if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && held) {
			event.preventDefault();
			step(id, event.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (event.key === 'Escape' && held) {
			event.preventDefault();
			cancel();
		}
	}

	// --- pointer ----------------------------------------------------------

	function handlePointerDown(
		event: PointerEvent & { currentTarget: EventTarget & HTMLLIElement },
		id: string
	) {
		if (disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		armed = id;
		pointerStart = event.clientY;
	}

	/** Measures every row once, at the moment of the lift. Nothing is re-measured mid-drag. */
	function lift(id: string) {
		const list = listEl;
		if (!list) return false;

		const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-reorder-row]'));
		if (rows.length === 0) return false;

		heights = new SvelteMap();
		let previousBottom = 0;
		rows.forEach((row, index) => {
			const rect = row.getBoundingClientRect();
			heights.set(row.dataset.reorderRow ?? '', rect.height);
			if (index === 1) gap = Math.max(0, rect.top - previousBottom);
			previousBottom = rect.bottom;
		});

		const at = indexOf(id);
		if (at < 0) return false;

		originTop = slotTop(at, idsOf());
		snapshot = [...items];
		active = true;
		dragging = id;
		settling = false;
		offset = 0;
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = undefined;
		}
		return true;
	}

	function handlePointerMove(event: PointerEvent, id: string) {
		if (disabled) return;
		if (!active) {
			if (armed !== id) return;
			// A press only becomes a lift once it travels, so a plain click still focuses the row.
			if (Math.abs(event.clientY - pointerStart) < LIFT) return;
			if (!lift(id)) return;
		} else if (dragging !== id) {
			return;
		}

		const height = heights.get(id) ?? 0;
		// The row follows the finger from where it started, not from where it now sits.
		const visualTop = originTop + (event.clientY - pointerStart);
		const centre = visualTop + height / 2;

		let order = idsOf();
		let at = order.indexOf(id);
		if (at < 0) return;
		let crossed = false;

		// One crossing per neighbour whose centre the row has passed; the siblings
		// open the gap the row will drop into.
		for (let guard = 0; guard < order.length; guard += 1) {
			const top = slotTop(at, order);
			const next = at + 1 < order.length ? (heights.get(order[at + 1]) ?? 0) : 0;
			const previous = at > 0 ? (heights.get(order[at - 1]) ?? 0) : 0;

			if (at + 1 < order.length && centre > top + height + gap + next / 2) {
				order = moveItem(order, at, at + 1);
				at += 1;
				crossed = true;
				continue;
			}
			if (at > 0 && centre < top - gap - previous / 2) {
				order = moveItem(order, at, at - 1);
				at -= 1;
				crossed = true;
				continue;
			}
			break;
		}

		if (crossed) onReorder(toItems(order));
		offset = visualTop - slotTop(at, order);
	}

	function endDrag() {
		armed = null;
		const id = dragging;
		if (!active || !id) return;

		active = false;
		snapshot = null;
		offset = 0;
		settling = true;
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(
			() => {
				settling = false;
				dragging = null;
				settleTimer = undefined;
			},
			reducedMotion.current ? 0 : CELL_MS
		);

		announce(id, (name, at) => `${name} dropped at position ${at}.`);
		onCommit?.([...items]);
	}

	/** Escape mid-drag puts the order back and lets the row fly home with its siblings. */
	function cancelDrag() {
		armed = null;
		if (!active || !dragging) return;

		active = false;
		if (snapshot) onReorder([...snapshot]);
		snapshot = null;
		offset = 0;
		settling = false;
		dragging = null;
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = undefined;
		}
		spoken = 'Reorder cancelled, original order restored.';
	}
</script>

<svelte:window
	onblur={endDrag}
	onkeydown={(event) => {
		if (event.key === 'Escape' && dragging) cancelDrag();
	}}
/>

<div {...restProps} data-slot="reorder-list" class={cn('w-full', className)}>
	<ul
		bind:this={listEl}
		role="listbox"
		aria-label={label}
		class="m-0 flex list-none flex-col gap-1.5 p-0"
	>
		{#each items as item (getId(item))}
			{@const id = getId(item)}
			{@const held = grabbed === id}
			{@const lifted = held || dragging === id}
			<li
				data-reorder-row={id}
				role="option"
				tabindex={disabled ? -1 : 0}
				aria-describedby={hintId}
				aria-selected={held}
				animate:motionFlip={{ transition: dragging === id ? { duration: 0 } : CELL }}
				onkeydown={(event) => rowKeyDown(event, id)}
				onpointerdown={(event) => handlePointerDown(event, id)}
				onpointermove={(event) => handlePointerMove(event, id)}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				onlostpointercapture={endDrag}
				onblur={() => {
					if (grabbed === id) cancel();
				}}
				{@attach motionTo(
					() => ({
						keyframes: {
							y: dragging === id ? offset : 0,
							// The lift only swells while the drag is live; on release the row
							// settles back to its own size as it lands.
							scale: dragging === id && !settling && !reducedMotion.current ? 1.02 : 1
						},
						// A live drag tracks the pointer exactly; only the release springs.
						transition: dragging === id && !settling ? { duration: 0 } : CELL
					}),
					{ initial: true }
				)}
				class={cn(
					'bg-card relative flex touch-pan-x items-center gap-2.5 rounded-[9px] border px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-150 outline-none select-none',
					lifted
						? 'border-border z-10 cursor-grabbing shadow-[0_1px_2px_rgba(28,25,23,0.08),0_14px_28px_-16px_rgba(28,25,23,0.5)] dark:shadow-[0_2px_14px_rgba(0,0,0,0.55)]'
						: 'border-border cursor-grab shadow-[0_1px_2px_rgba(28,25,23,0.06)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
					held
						? 'border-primary bg-primary/[0.06]'
						: 'focus-visible:bg-primary/5 focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
					disabled && 'cursor-default'
				)}
			>
				<span
					aria-hidden="true"
					class={cn(
						'shrink-0 transition-colors duration-150',
						lifted ? 'text-muted-foreground' : 'text-muted-foreground/40'
					)}
				>
					<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
						<circle cx="2.5" cy="2.5" r="1.2" />
						<circle cx="7.5" cy="2.5" r="1.2" />
						<circle cx="2.5" cy="7" r="1.2" />
						<circle cx="7.5" cy="7" r="1.2" />
						<circle cx="2.5" cy="11.5" r="1.2" />
						<circle cx="7.5" cy="11.5" r="1.2" />
					</svg>
				</span>
				<span class="sr-only">{getLabel(item)}</span>
				<div aria-hidden="true" class="min-w-0 flex-1">{@render children(item)}</div>
			</li>
		{/each}
	</ul>

	<span id={hintId} class="sr-only">
		Drag to reorder. With the keyboard, Space grabs the row, the arrow keys move it, Space drops it,
		and Escape puts everything back.
	</span>

	<span role="status" aria-live="polite" class="sr-only">{spoken}</span>
</div>
