<script lang="ts" generics="T">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { animate, motionValue } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** Slides settling as the carousel lands. */
	const SLIDE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	/** The dots, snappier than the slides they stand for. */
	const DOT = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	export interface SnapCarouselProps<Item> extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children'
	> {
		/** One entry per slide. Each is laid out in a full-width, non-shrinking cell, so slides never disagree about width. */
		items: readonly Item[];
		/** Slide contents. The component owns the cell, the width and the inert state. */
		slide: Snippet<[Item, number]>;
		/** Stable identity per slide. Defaults to the index. */
		getKey?: (item: Item, index: number) => string | number;
		/** Accessible name for the carousel group. Required, because an unnamed region is a dead end for a screen reader. */
		label: string;
		/** Resting slide. Bindable — if the parent refuses a change, the track glides back to the index it was given. */
		index?: number;
		/** Uncontrolled starting slide, clamped into range. */
		defaultIndex?: number;
		/** Fires once per landing, with the settled index. Never fires mid-gesture. */
		onIndexChange?: (index: number) => void;
		/** Pixels between slides. Folded into the snap step, so the gap can never accumulate into drift. */
		gap?: number;
		/** Pixels of the neighbouring slides left visible at each edge. */
		peek?: number;
		/** Seconds of release velocity projected forward when picking the landing slide. */
		momentum?: number;
		/** Cap on how many slides past the release point a single flick can travel. */
		maxFlick?: number;
		/** Turns off dragging. Buttons and keys still work. */
		disabled?: boolean;
		/** Accessible name of the previous button. */
		prevLabel?: string;
		/** Accessible name of the next button. */
		nextLabel?: string;
	}

	type SpringSpec = { stiffness: number; damping: number; mass: number };

	/** The landing spring — soft, catchable, handed the gesture's exit velocity. */
	const CROSSFADE: SpringSpec = { stiffness: 260, damping: 34, mass: 0.8 };
	/** The wall bounce at either end of the track. */
	const WALL: SpringSpec = { stiffness: 700, damping: 30, mass: 0.5 };
	const WALL_IMPULSE = 900;
	/** Rubber-band factor applied past either end while dragging. */
	const ELASTIC = 0.14;

	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

	let {
		class: className,
		items,
		slide,
		getKey,
		label,
		defaultIndex = 0,
		index = $bindable(defaultIndex),
		onIndexChange,
		gap = 12,
		peek = 0,
		momentum = 0.14,
		maxFlick = 1,
		disabled = false,
		prevLabel = 'Previous slide',
		nextLabel = 'Next slide',
		...restProps
	}: SnapCarouselProps<T> = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	const total = $derived(Math.max(1, items.length));
	const current = $derived(clamp(Math.round(index ?? 0), 0, total - 1));

	let slideWidth = $state(0);
	let dragging = $state(false);
	/** The slide a gesture is currently heading for. Only consulted while dragging. */
	let landing = $state(0);
	/**
	 * The track's offset lives in a Motion value so the landing spring can be
	 * handed the velocity the gesture left on it. `x` mirrors it for the template.
	 */
	const offset = motionValue(0);
	let x = $state(0);

	$effect(() =>
		offset.on('change', (value) => {
			x = value;
		})
	);

	const step = $derived(slideWidth + gap);
	/** The slide the carousel is committed to right now: the drag target while a finger is down. */
	const shown = $derived(dragging ? landing : current);

	const mask = $derived(
		peek > 0
			? `linear-gradient(to right, transparent 0, black ${peek + 14}px, black calc(100% - ${peek + 14}px), transparent 100%)`
			: undefined
	);

	let controls: { stop: () => void } | null = null;
	let desired: number | null = null;

	function stop() {
		controls?.stop();
		controls = null;
	}

	onDestroy(stop);

	// The landing is never restarted from rest: the spring is handed the speed the
	// track already carries, so a flick caught mid-flight settles rather than
	// snapping back to the slide it was leaving.
	function glide(to: number, spec: SpringSpec, exit = 0) {
		desired = to;
		stop();

		if (reducedMotion.current) {
			offset.jump(to);
			return;
		}

		controls = animate(offset, to, {
			...spec,
			type: 'spring',
			velocity: exit || offset.getVelocity()
		});
	}

	function goTo(next: number, exit = 0) {
		const to = clamp(Math.round(next), 0, total - 1);
		landing = to;
		if (to !== current) {
			index = to;
			onIndexChange?.(to);
		}
		glide(-to * step, CROSSFADE, exit);
	}

	function bounce(direction: 1 | -1) {
		glide(-current * step, WALL, -direction * WALL_IMPULSE);
	}

	function move(direction: 1 | -1) {
		const to = current + direction;
		if (to < 0 || to > total - 1) bounce(direction);
		else goTo(to);
	}

	// A flick resolves to a slide index before the landing spring starts, capped
	// at maxFlick slides past where the finger actually let go.
	function pick(exit: number) {
		if (step === 0) return current;
		const at = -x / step;
		const anchor = clamp(Math.round(at), 0, total - 1);
		const projected = at - (exit * momentum) / step;
		return clamp(clamp(Math.round(projected), anchor - maxFlick, anchor + maxFlick), 0, total - 1);
	}

	function elastic(raw: number) {
		const min = -(total - 1) * step;
		if (raw > 0) return raw * ELASTIC;
		if (raw < min) return min + (raw - min) * ELASTIC;
		return raw;
	}

	let pointerId: number | null = null;
	let captured = false;
	let startX = 0;
	let originX = 0;
	let lastX = 0;
	let lastT = 0;
	let dragVelocity = 0;

	function handlePointerDown(event: PointerEvent) {
		if (disabled || total < 2 || step === 0) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		captured = false;
		startX = event.clientX;
		originX = offset.get();
		lastX = event.clientX;
		lastT = event.timeStamp;
		dragVelocity = 0;
	}

	function handlePointerMove(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;

		const travel = event.clientX - startX;
		if (!captured) {
			if (Math.abs(travel) < 3) return;
			captured = true;
			dragging = true;
			landing = current;
			stop();
			originX = offset.get();
			startX = event.clientX;
			// SAFETY: this handler is only ever bound to the track div's onpointerdown below.
			(event.currentTarget as HTMLElement).setPointerCapture(pointerId);
			return;
		}

		const elapsed = Math.max(1, event.timeStamp - lastT);
		dragVelocity = ((event.clientX - lastX) / elapsed) * 1000;
		lastX = event.clientX;
		lastT = event.timeStamp;

		offset.set(elastic(originX + travel));
		const to = pick(dragVelocity);
		if (to !== landing) landing = to;
	}

	function handlePointerUp(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;

		// SAFETY: this handler is only ever bound to the track div's onpointerup below.
		const element = event.currentTarget as HTMLElement;
		if (captured && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);

		const wasDragging = captured;
		pointerId = null;
		captured = false;
		if (!wasDragging) return;

		// A finger that came to rest before lifting is not a flick.
		const exit = event.timeStamp - lastT > 100 ? 0 : dragVelocity;

		dragging = false;
		goTo(pick(exit), exit);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			goTo(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			goTo(total - 1);
		}
	}

	// Nothing else gets to scroll the clipped track out of alignment.
	function guard(event: Event) {
		// SAFETY: this handler is only ever bound to the track div's onscroll below.
		const element = event.currentTarget as HTMLElement;
		element.scrollLeft = 0;
		element.scrollTop = 0;
	}

	const viewport: Attachment<HTMLElement> = (el) => {
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			if (Math.abs(slideWidth - width) >= 0.5) slideWidth = width;
		});
		observer.observe(el);
		return () => observer.disconnect();
	};

	let lastStep = 0;

	// A resize re-lands the track without animating; a change of index glides.
	$effect(() => {
		const size = step;
		const to = -current * size;
		const busy = dragging;

		if (size === 0) return;

		if (lastStep !== size) {
			lastStep = size;
			desired = to;
			stop();
			offset.jump(to);
			return;
		}

		if (busy || desired === to) return;
		glide(to, CROSSFADE);
	});
</script>

<div {...restProps} class={cn('w-full', className)}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		{@attach viewport}
		tabindex="0"
		role="group"
		aria-roledescription="carousel"
		aria-label={label}
		aria-describedby={hintId}
		style:padding-left="{peek}px"
		style:padding-right="{peek}px"
		style:-webkit-mask-image={mask}
		style:mask-image={mask}
		onkeydown={handleKeyDown}
		onscroll={guard}
		class="focus-visible:bg-primary/5 relative overflow-hidden rounded-[14px] py-1.5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			style:gap="{gap}px"
			style:transform="translate3d({x}px, 0, 0)"
			style:touch-action="pan-y"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			ondragstart={(event) => event.preventDefault()}
			class={cn('flex items-stretch', dragging ? 'cursor-grabbing' : 'cursor-grab')}
		>
			{#each items as item, i (getKey ? getKey(item, i) : i)}
				<div
					role="group"
					aria-roledescription="slide"
					aria-label="{i + 1} of {items.length}"
					inert={i !== current}
					class="w-full shrink-0 select-none"
					{@attach motionTo(() => ({
						keyframes: i === shown ? { scale: 1, opacity: 1 } : { scale: 0.96, opacity: 0.55 },
						transition: SLIDE
					}))}
				>
					{@render slide(item, i)}
				</div>
			{/each}
		</div>
	</div>

	<div class="mt-3 flex items-center justify-between gap-3">
		<span class="flex items-center gap-[3px]">
			{#each items as item, i (getKey ? getKey(item, i) : i)}
				<button
					type="button"
					onclick={() => goTo(i)}
					aria-label="Go to slide {i + 1}"
					aria-current={i === current ? 'true' : undefined}
					class="focus-visible:bg-primary/5 grid h-[18px] w-[16px] cursor-pointer place-items-center rounded-[5px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
				>
					<span
						aria-hidden="true"
						class="bg-foreground block h-[5px] w-[14px] rounded-[1.5px]"
						{@attach motionTo(() => ({
							keyframes: i === shown ? { scaleX: 1, opacity: 1 } : { scaleX: 0.36, opacity: 0.26 },
							transition: DOT
						}))}
					></span>
				</button>
			{/each}
		</span>

		<span class="flex items-center gap-1.5">
			<button type="button" onclick={() => move(-1)} aria-label={prevLabel} class="carousel-button">
				<svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
					<polyline
						points="160 208 80 128 160 48"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button type="button" onclick={() => move(1)} aria-label={nextLabel} class="carousel-button">
				<svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
					<polyline
						points="96 48 176 128 96 208"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</span>
	</div>

	<span id={hintId} class="sr-only">
		Left and right arrow keys move between {items.length} slides.
	</span>
	<span aria-live="polite" aria-atomic="true" class="sr-only">
		Slide {current + 1} of {items.length}
	</span>
</div>

<style>
	.carousel-button {
		display: grid;
		place-items: center;
		block-size: 1.75rem;
		inline-size: 1.75rem;
		cursor: pointer;
		border-radius: 6px;
		border: 1px solid var(--border);
		background-color: var(--card);
		color: var(--foreground);
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.5),
			0 1px 2px rgba(0, 0, 0, 0.08);
		outline: none;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			box-shadow 150ms ease,
			transform 150ms ease;
	}

	.carousel-button:hover {
		background-color: color-mix(in oklab, var(--card) 92%, var(--foreground));
	}

	.carousel-button:active {
		transform: translateY(1px);
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
	}

	.carousel-button:focus-visible {
		border-color: var(--ring);
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.08),
			0 0 0 1px var(--ring);
	}

	@media (prefers-reduced-motion: reduce) {
		.carousel-button {
			transition: none;
		}
	}
</style>
