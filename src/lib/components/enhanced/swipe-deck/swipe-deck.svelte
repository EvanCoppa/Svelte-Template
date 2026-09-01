<script lang="ts" module>
	/** Which way a card was sent. */
	export type SwipeChoice = 'left' | 'right';
	/** The live drag, quantised: which side it is heading for and how far into the commit it is. */
	export type SwipeIntent = { dir: -1 | 0 | 1; step: number };
	/** How the top card arrived — sent away, or brought back by undo. */
	export type SwipeDeckFlow = { dir: -1 | 1; kind: 'decide' | 'undo' };

	/** Pixels per second that count as a flick even when the card is short of the threshold. */
	const FLICK = 520;

	const BLANK: SwipeIntent = { dir: 0, step: 0 };
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The empty note behind the deck fading up once the last card is gone. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	import SwipeDeckCard from './swipe-deck-card.svelte';

	export interface SwipeDeckProps<Item> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The queue, in order. The deck consumes it from the front; nothing is mutated. */
		items: readonly Item[];
		/** Stable identity per card. Keys the stack, so it must not change between renders. */
		itemKey: (item: Item) => string;
		/** One-line summary. Names the card for assistive tech and is what the live region announces. */
		itemLabel: (item: Item) => string;
		/** The card face. Receives a box of exactly `height` pixels; leave the top 24px clear for the stamps. */
		card: Snippet<[Item]>;
		/** Fired once when a card commits, by drag, flick, arrow key or button. */
		onDecide?: (item: Item, choice: SwipeChoice) => void;
		/** Fired when a decision is reversed, with the item that came back. */
		onUndo?: (item: Item) => void;
		/** Accessible name for the deck group. */
		label?: string;
		/** Left decision. Used on the button and on the stamp that fades in as you drag left. */
		leftLabel?: string;
		/** Right decision, same treatment mirrored. */
		rightLabel?: string;
		/** Label on the undo control, which is always present and disabled rather than absent. */
		undoLabel?: string;
		/** Shown in the reserved box once the queue is spent. */
		emptyLabel?: string;
		/** Card height in pixels. The deck reserves height + 26 so the fanned stack never overflows. */
		height?: number;
		/** Horizontal pixels a card must travel to commit. Also the denominator for the intent cells. */
		threshold?: number;
		/** How many cells the approach to the threshold is quantised into, per side. */
		steps?: number;
		/** Cards mounted at once. Everything past this is not in the DOM. */
		peek?: number;
	}

	let {
		class: className,
		items,
		itemKey,
		itemLabel,
		card,
		onDecide,
		onUndo,
		label = 'Card deck',
		leftLabel = 'Skip',
		rightLabel = 'Keep',
		undoLabel = 'Undo',
		emptyLabel = 'Deck cleared',
		height = 180,
		threshold = 92,
		steps = 6,
		peek = 3,
		...restProps
	}: SwipeDeckProps<T> = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	const total = $derived(Math.max(0, Math.floor(items.length)));
	const grain = $derived(Math.max(1, Math.floor(steps)));
	const reach = $derived(Math.max(1, threshold));

	let decisions = $state<SwipeChoice[]>([]);
	let flow = $state<SwipeDeckFlow>({ dir: 1, kind: 'decide' });
	let intent = $state<SwipeIntent>(BLANK);

	const index = $derived(Math.min(decisions.length, total));
	const remaining = $derived(total - index);
	const done = $derived(index >= total);
	const canUndo = $derived(decisions.length > 0);
	const armed = $derived(intent.step >= grain);
	const progress = $derived(intent.step / grain);
	const stack = $derived(items.slice(index, index + Math.max(1, peek)));
	const current = $derived(items[index]);

	function clear() {
		if (intent.step === 0 && intent.dir === 0) return;
		intent = BLANK;
	}

	function decide(choice: SwipeChoice) {
		const at = decisions.length;
		if (at >= total) return;
		const item = items[at];
		decisions = [...decisions, choice];
		flow = { dir: choice === 'right' ? 1 : -1, kind: 'decide' };
		intent = BLANK;
		if (item !== undefined) onDecide?.(item, choice);
	}

	function undo() {
		const at = decisions.length;
		if (at === 0) return;
		const last = decisions[at - 1];
		const item = items[at - 1];
		decisions = decisions.slice(0, at - 1);
		flow = { dir: last === 'right' ? 1 : -1, kind: 'undo' };
		intent = BLANK;
		if (item !== undefined) onUndo?.(item);
	}

	// Drag distance reaches the deck as one of `steps` cells per side rather than
	// a float, so a long swipe costs a handful of updates instead of one a frame.
	function report(dx: number) {
		const step = Math.min(grain, Math.round((Math.abs(dx) / reach) * grain));
		const dir: -1 | 0 | 1 = step === 0 ? 0 : dx > 0 ? 1 : -1;
		if (intent.dir === dir && intent.step === step) return;
		intent = { dir, step };
	}

	// The commit rule: either the full threshold, or a genuine flick that already
	// covered a third of it. Anything less and the card was never decided.
	function release(dx: number, vx: number) {
		const far = Math.abs(dx) >= reach;
		const fast = Math.abs(vx) >= FLICK && Math.abs(dx) >= reach * 0.35;
		if (!far && !fast) {
			clear();
			return false;
		}
		decide((far ? dx : vx) > 0 ? 'right' : 'left');
		return true;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			decide('left');
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			decide('right');
		} else if (event.key === 'Backspace' || event.key === 'Delete') {
			event.preventDefault();
			undo();
		} else if (event.key === 'Escape') {
			clear();
		}
	}

	function abandon() {
		clear();
	}

	function onVisibilityChange() {
		if (document.hidden) clear();
	}

	const control =
		'inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition-[background-color,border-color,opacity] duration-150 hover:bg-muted focus-visible:border-ring';
</script>

<svelte:window onblur={abandon} />
<svelte:document onvisibilitychange={onVisibilityChange} />

<div {...restProps} class={cn('w-full', className)}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="group"
		aria-roledescription="card deck"
		aria-label={label}
		aria-describedby={hintId}
		tabindex="0"
		onkeydown={handleKeyDown}
		style:height="{height + 26}px"
		class="relative w-full overflow-hidden rounded-[14px] outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)]"
	>
		<div
			class="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]"
		>
			<div
				aria-hidden={done ? undefined : 'true'}
				style:height="{height}px"
				{@attach motionTo(() => ({ keyframes: { opacity: done ? 1 : 0 }, transition: CROSSFADE }))}
				class="bg-muted/60 text-muted-foreground absolute inset-x-5 top-0 z-0 grid place-items-center rounded-[14px] px-4 text-center text-[12.5px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
			>
				{emptyLabel}
			</div>

			{#each stack as item, depth (itemKey(item))}
				<SwipeDeckCard
					{depth}
					{height}
					entryX={depth === 0 && flow.kind === 'undo' ? flow.dir * 560 : 0}
					active={depth === 0}
					label={itemLabel(item)}
					{leftLabel}
					{rightLabel}
					intentDir={intent.dir}
					{progress}
					{armed}
					reduced={reducedMotion.current}
					exitDir={() => flow.dir}
					onMove={report}
					onRelease={release}
					onCancel={clear}
				>
					{@render card(item)}
				</SwipeDeckCard>
			{/each}
		</div>
	</div>

	<div class="mt-3 grid h-8 grid-cols-[1fr_auto_1fr] items-center gap-3">
		<button
			type="button"
			onclick={() => decide('left')}
			inert={done}
			style:opacity={done ? 0 : 1}
			class={cn(control, 'justify-self-start')}
		>
			<svg width="12" height="12" viewBox="0 0 256 256" fill="none" aria-hidden="true">
				<line
					x1="200"
					y1="56"
					x2="56"
					y2="200"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
				/>
				<line
					x1="200"
					y1="200"
					x2="56"
					y2="56"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
				/>
			</svg>
			<span>{leftLabel}</span>
		</button>

		<span
			class="text-muted-foreground flex items-center gap-2 font-mono text-[10.5px] tabular-nums"
		>
			<span aria-hidden="true" class="inline-grid justify-items-end">
				<span class="invisible col-start-1 row-start-1">{items.length}</span>
				<span class="col-start-1 row-start-1">{remaining}</span>
			</span>
			<span aria-hidden="true">left</span>
			<button
				type="button"
				onclick={undo}
				inert={!canUndo}
				style:opacity={canUndo ? 1 : 0}
				class="text-foreground hover:bg-muted focus-visible:bg-primary/5 inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 transition-[background-color,box-shadow,opacity] duration-150 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
			>
				<svg width="12" height="12" viewBox="0 0 256 256" fill="none" aria-hidden="true">
					<polyline
						points="72 104 24 104 24 56"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M67.6,192.1a88,88,0,1,0,0-128.2L24,104"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>{undoLabel}</span>
			</button>
		</span>

		<button
			type="button"
			onclick={() => decide('right')}
			inert={done}
			style:opacity={done ? 0 : 1}
			class={cn(control, 'justify-self-end')}
		>
			<span>{rightLabel}</span>
			<svg width="12" height="12" viewBox="0 0 256 256" fill="none" aria-hidden="true">
				<polyline
					points="216 72 104 184 48 128"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>

	<p aria-live="polite" aria-atomic="true" class="sr-only">
		{done || current === undefined
			? emptyLabel
			: `${itemLabel(current)}. Card ${index + 1} of ${items.length}.`}
	</p>
	<span id={hintId} class="sr-only">
		Left and right arrow keys decide the top card. Backspace brings the last one back.
	</span>
</div>
