<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTransition, reducedMotion } from '$lib/motion.js';

	/** The pill arriving from the edge it is anchored to. */
	const ARRIVE = { type: 'spring', stiffness: 540, damping: 34, mass: 0.5 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

	export type NewItemsAnchor = 'top' | 'bottom';

	export interface NewItemsPillProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/**
		 * The scroll container the pill watches. It is given `overflow-anchor: none`
		 * and made focusable, so the jump can land focus on it.
		 */
		scroller: HTMLElement | null | undefined;
		/** Current length of the rendered list. Every increase is an arrival. */
		itemCount: number;
		/** Which edge new items arrive at. */
		anchor?: NewItemsAnchor;
		/** Pixels from the anchored edge still counted as being at the edge. */
		threshold?: number;
		/** Builds the visible text and the accessible name. Pluralise here. */
		label?: (count: number) => string;
		/** Counts above this render as "99+". */
		max?: number;
		/** Fired on activation, with how many had piled up, so the caller can mark them. */
		onJump?: (caught: number) => void;
	}

	const defaultLabel = (n: number) => `${n} new ${n === 1 ? 'item' : 'items'}`;

	let {
		class: className,
		scroller,
		itemCount,
		anchor = 'top',
		threshold = 24,
		label = defaultLabel,
		max = 99,
		onJump,
		...restProps
	}: NewItemsPillProps = $props();

	let unread = $state(0);
	let announced = $state(0);

	// Read into plain fields: scrolling must not re-render anything per event.
	let pinned = true;
	let gap = 0;
	// The list already on screen is not an arrival.
	let prevCount = untrack(() => itemCount);

	const text = $derived(unread > max ? `${max}+ new items` : label(unread));
	const announcement = $derived(
		announced === 0 ? '' : announced > max ? `${max}+ new items` : label(announced)
	);
	const offset = $derived(anchor === 'bottom' ? 10 : -10);

	$effect(() => {
		const el = scroller;
		if (!el) return;

		const previousAnchor = el.style.overflowAnchor;
		const hadTabIndex = el.hasAttribute('tabindex');
		// The browser's own scroll anchoring would fight the compensation below.
		el.style.overflowAnchor = 'none';
		if (!hadTabIndex) el.setAttribute('tabindex', '0');

		const atEdge = () =>
			anchor === 'bottom'
				? el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
				: el.scrollTop <= threshold;

		const onScroll = () => {
			gap = el.scrollHeight - el.scrollTop;
			const next = atEdge();
			if (next === pinned) return;
			pinned = next;
			// Scrolling back to the edge yourself clears the count without a click.
			if (next) unread = 0;
		};

		onScroll();
		el.addEventListener('scroll', onScroll, { passive: true });

		return () => {
			el.removeEventListener('scroll', onScroll);
			el.style.overflowAnchor = previousAnchor;
			if (!hadTabIndex) el.removeAttribute('tabindex');
		};
	});

	// Runs after the new rows are in the DOM and before the browser paints, so the
	// reading position is restored in the same frame the arrivals commit.
	$effect(() => {
		const count = itemCount;
		const el = scroller;
		const added = count - prevCount;
		prevCount = count;
		if (!el || added <= 0) return;

		if (pinned) {
			el.scrollTop = anchor === 'bottom' ? el.scrollHeight : 0;
			gap = el.scrollHeight - el.scrollTop;
			return;
		}

		if (anchor === 'top') {
			const target = el.scrollHeight - gap;
			if (target > el.scrollTop) el.scrollTop = target;
		}

		unread = untrack(() => unread) + added;
	});

	// One settled count instead of one announcement per item.
	$effect(() => {
		if (unread === 0) {
			announced = 0;
			return;
		}
		const settled = unread;
		const timer = setTimeout(() => {
			announced = settled;
		}, 700);
		return () => clearTimeout(timer);
	});

	function jump() {
		const caught = unread;
		const el = scroller;
		pinned = true;
		unread = 0;

		if (el) {
			// Focus lands on the scroll container before the pill unmounts, so it is
			// never dropped to the body.
			el.focus({ preventScroll: true });
			el.scrollTo({
				top: anchor === 'bottom' ? el.scrollHeight : 0,
				behavior: reducedMotion.current ? 'auto' : 'smooth'
			});
		}

		onJump?.(caught);
	}

	/** It arrives from the edge the items arrived from and leaves the same way. */
	function arriveIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], scale: [0.94, 1], y: [offset, 0] },
			transition: { ...ARRIVE, opacity: { duration: 0.16, ease: EASE } },
			reduced: { keyframes: { opacity: [0, 1] }, transition: { duration: 0.14 } }
		});
	}

	function arriveOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.96, y: offset * 0.5 },
			transition: { duration: 0.16, ease: EASE },
			reduced: { keyframes: { opacity: 0 }, transition: { duration: 0.14 } }
		});
	}
</script>

<div
	{...restProps}
	class={cn(
		'pointer-events-none absolute inset-x-0 z-10 flex justify-center',
		anchor === 'bottom' ? 'bottom-2' : 'top-2',
		className
	)}
>
	{#if unread > 0}
		<button
			type="button"
			onclick={jump}
			aria-label={text}
			in:arriveIn
			out:arriveOut
			class="border-border bg-card text-foreground focus-visible:border-ring pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border pr-2.5 pl-2 text-[12.5px] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_14px_-10px_rgb(0_0_0/0.45)] transition-[border-color,box-shadow] duration-150 outline-none select-none focus-visible:shadow-[0_2px_4px_rgb(0_0_0/0.1),0_12px_22px_-12px_rgb(0_0_0/0.4)]"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 256 256"
				fill="none"
				aria-hidden="true"
				class={anchor === 'bottom' ? 'rotate-180' : ''}
			>
				<line
					x1="128"
					y1="216"
					x2="128"
					y2="48"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
				/>
				<polyline
					points="56 120 128 48 200 120"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="tabular-nums" aria-hidden="true">{text}</span>
		</button>
	{/if}

	<span role="status" aria-live="polite" class="sr-only">{announcement}</span>
</div>
