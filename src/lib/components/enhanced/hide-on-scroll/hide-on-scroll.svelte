<script lang="ts">
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The bar yielding to the scroll and coming back. */
	const DISCLOSE = { type: 'spring', stiffness: 150, damping: 27, mass: 1 } as const;
	/** The hairline under it appearing once the content has moved. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export interface HideOnScrollProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Contents of the toolbar. Laid out in a flex row; give the title `min-w-0 flex-1 truncate`. */
		bar: Snippet;
		/** The scrolling content. A spacer of `barHeight` is inserted above it, so nothing starts underneath the bar. */
		children?: Snippet;
		/** Height of the bar in pixels, and the exact distance it travels when it yields. */
		barHeight?: number;
		/** Pixels of uninterrupted downward travel required before the bar yields. */
		hideAfter?: number;
		/** Pixels of upward travel required to bring the bar back. Kept below `hideAfter`, so returning is cheaper than leaving. */
		revealAfter?: number;
		/** Distance from the top inside which the bar is always shown. */
		topGuard?: number;
		/** Forces the bar open and holds it there — set it while a menu the bar owns is on screen. */
		pinned?: boolean;
		/** Height cap on the scroll region in pixels. */
		maxHeight?: number;
		/** Accessible name of the scroll region. */
		label?: string;
		/** Fires on the transition, never per frame. */
		onHiddenChange?: (hidden: boolean) => void;
	}

	let {
		class: className,
		bar,
		children,
		barHeight = 44,
		hideAfter = 14,
		revealAfter = 10,
		topGuard = 24,
		pinned = false,
		maxHeight = 320,
		label = 'Scrollable content',
		onHiddenChange,
		...restProps
	}: HideOnScrollProps = $props();

	let hidden = $state(false);
	let atTop = $state(true);
	let focusWithin = $state(false);

	const down = $derived(Math.max(1, hideAfter));
	const up = $derived(Math.max(1, revealAfter));
	const guard = $derived(Math.max(0, topGuard));
	// Focus entering the bar pins it open before the control lands.
	const held = $derived(pinned || focusWithin);

	let scroller: HTMLDivElement | null = null;
	let frame = 0;
	let last = 0;
	let accum = 0;

	// Direction is decided by accumulated travel, so a two-pixel trackpad wobble
	// cannot flap the bar open and shut while someone reads.
	function evaluate() {
		frame = 0;

		const el = scroller;
		if (!el) return;

		const max = el.scrollHeight - el.clientHeight;
		const y = el.scrollTop;

		// Too short to scroll: the bar is unconditionally shown.
		if (max <= guard) {
			accum = 0;
			last = y;
			atTop = true;
			hidden = false;
			return;
		}

		// Overscroll past either end is discarded rather than read as a direction change.
		if (y < 0 || y > max) return;

		const dy = y - last;
		last = y;

		const top = y <= guard;
		atTop = top;

		if (held || top) {
			accum = 0;
			hidden = false;
			return;
		}

		if (dy === 0) return;
		if (dy > 0 !== accum > 0) accum = 0;
		accum += dy;

		if (accum >= down) {
			accum = 0;
			hidden = true;
		} else if (accum <= -up) {
			accum = 0;
			hidden = false;
		}
	}

	function schedule() {
		if (frame) return;
		frame = requestAnimationFrame(evaluate);
	}

	const watch: Attachment<HTMLDivElement> = (el) => {
		scroller = el;
		last = el.scrollTop;
		untrack(evaluate);

		const observer = new ResizeObserver(schedule);
		observer.observe(el);

		return () => {
			observer.disconnect();
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			scroller = null;
		};
	};

	// A pin, or a list that stops scrolling, must not strand the bar off-screen.
	$effect(() => {
		if (!held) return;
		accum = 0;
		hidden = false;
	});

	let announced = false;

	$effect(() => {
		const now = hidden;
		if (announced === now) return;
		announced = now;
		onHiddenChange?.(now);
	});
</script>

<svelte:window onresize={schedule} />

<div
	{...restProps}
	class={cn(
		'border-border bg-card relative w-full min-w-0 overflow-hidden rounded-[14px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
>
	<div
		data-hidden={hidden ? 'true' : 'false'}
		onfocusin={() => (focusWithin = true)}
		onfocusout={() => (focusWithin = false)}
		style:height="{barHeight}px"
		class="bg-card absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3"
		{@attach motionTo(() => ({
			keyframes: { y: hidden ? -barHeight : 0 },
			transition: DISCLOSE
		}))}
	>
		{@render bar()}

		<span
			aria-hidden="true"
			class="bg-border pointer-events-none absolute inset-x-0 bottom-0 h-px"
			{@attach motionTo(() => ({ keyframes: { opacity: atTop ? 0 : 1 }, transition: CROSSFADE }))}
		></span>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		{@attach watch}
		tabindex="0"
		role="region"
		aria-label={label}
		onscroll={schedule}
		style:max-height="{maxHeight}px"
		style:scroll-padding-top="{barHeight + 8}px"
		class="focus-visible:bg-primary/5 overflow-y-auto overscroll-y-contain outline-none [scrollbar-gutter:stable] focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
	>
		<!-- The spacer permanently reserves the bar's height, so nothing reflows when it yields. -->
		<div aria-hidden="true" style:height="{barHeight}px"></div>
		<div
			aria-hidden="true"
			class="from-card pointer-events-none sticky top-0 -mb-5 h-5 bg-gradient-to-b to-transparent"
		></div>

		{@render children?.()}

		<div
			aria-hidden="true"
			class="from-card pointer-events-none sticky bottom-0 -mt-5 h-5 bg-gradient-to-t to-transparent"
		></div>
	</div>
</div>
