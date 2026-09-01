<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { reducedMotion } from '$lib/motion.js';

	const RAMP = 0.19;
	const SETTLE = 0.16;
	const MAX_COPIES = 14;

	export type MarqueeDirection = 'left' | 'right';

	export interface LogoMarqueeItem {
		id: string;
		label: string;
		href?: string;
	}

	export interface LogoMarqueeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
		items: LogoMarqueeItem[];
		/** Accessible name for the strip. */
		label?: string;
		/** Travel speed in pixels per second. */
		speed?: number;
		direction?: MarqueeDirection;
		/** Gap between logos and between copies, in pixels. */
		gap?: number;
		/** Hold the strip still. */
		paused?: boolean;
		onSelect?: (item: LogoMarqueeItem) => void;
		/** Visual mark rendered per item; the label stays available to screen readers. */
		mark?: Snippet<[LogoMarqueeItem]>;
	}

	let {
		class: className,
		items,
		label = 'Logos',
		speed = 44,
		direction = 'left',
		gap = 40,
		paused = false,
		onSelect,
		mark,
		...restProps
	}: LogoMarqueeProps = $props();

	const FACE =
		'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground';

	const HIT =
		'outline-none transition-colors duration-150 hover:text-foreground focus-visible:bg-ring/10 focus-visible:text-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]';

	let viewportEl = $state<HTMLDivElement | null>(null);
	let trackEl = $state<HTMLDivElement | null>(null);
	let groupEl = $state<HTMLUListElement | null>(null);

	let copies = $state(4);
	let held = $state(false);
	let near = $state(false);

	// Transport state lives outside the reactivity graph: one rAF loop writes a
	// single transform to the track, and nothing re-renders to move it.
	let offset = 0;
	let nudge = 0;
	let rate = 0;
	let span = 0;

	const live = $derived(reducedMotion.current ? 0 : 1);
	const copyList = $derived(
		Array.from({ length: reducedMotion.current ? 1 : copies }, (_, i) => i)
	);

	function fold(x: number, loop: number) {
		const m = x % loop;
		return m > 0 ? m - loop : m;
	}

	function clamp(x: number, min: number, max: number) {
		return x < min ? min : x > max ? max : x;
	}

	function paint() {
		if (!trackEl) return;
		const x = reducedMotion.current ? 0 : offset - span;
		trackEl.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
	}

	// Measure one group and the viewport; the repeat count and the wrap length
	// both come from real widths, so the wrap always lands pixel-identically.
	$effect(() => {
		const viewport = viewportEl;
		const group = groupEl;
		if (!viewport || !group) return;
		const currentGap = gap;
		const isReduced = reducedMotion.current;

		const measure = () => {
			const width = group.getBoundingClientRect().width;
			const loop = width > 0 ? width + currentGap : 0;
			const room = viewport.getBoundingClientRect().width;
			span = loop;
			offset = loop > 0 ? clamp(offset, -loop, loop) : 0;
			paint();

			copies = isReduced || loop <= 0 ? 4 : clamp(Math.ceil(room / loop) + 3, 4, MAX_COPIES);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		observer.observe(group);
		return () => observer.disconnect();
	});

	// Unsubscribe the loop entirely while the strip is off-screen.
	$effect(() => {
		const viewport = viewportEl;
		if (!viewport) return;
		if (!('IntersectionObserver' in globalThis)) {
			near = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (entry) near = entry.isIntersecting;
			},
			{ rootMargin: '96px' }
		);
		observer.observe(viewport);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (reducedMotion.current || !near) return;

		let frame = 0;
		let last = 0;
		const sign = direction === 'right' ? 1 : -1;
		const pace = speed;

		const tick = (now: number) => {
			frame = requestAnimationFrame(tick);

			const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
			last = now;

			const loop = span;
			if (loop <= 0) return;

			const moving = !(held || paused) && !reducedMotion.current;
			rate += ((moving ? 1 : 0) - rate) * (1 - Math.exp(-dt / RAMP));

			const pull = nudge * (1 - Math.exp(-dt / SETTLE));
			nudge -= pull;

			let x = offset + sign * pace * rate * dt + pull;
			if (rate > 0.002 && Math.abs(nudge) < 0.25) {
				nudge = 0;
				x = fold(x, loop);
			} else {
				x = clamp(x, -loop, loop);
			}

			offset = x;
			paint();
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// The browser's own focus scrolling must never desync scroll from transform.
	function pin() {
		const viewport = viewportEl;
		if (!viewport || reducedMotion.current) return;
		if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
		if (viewport.scrollTop !== 0) viewport.scrollTop = 0;
	}

	// Pull a focused logo inside the viewport before its focus ring paints off-screen.
	function reveal(node: HTMLElement) {
		const viewport = viewportEl;
		const loop = span;
		if (!viewport || reducedMotion.current || loop <= 0) return;
		if (node === viewport) return;

		const view = viewport.getBoundingClientRect();
		const box = node.getBoundingClientRect();
		const pad = 12;

		let delta = 0;
		if (box.left < view.left + pad) delta = view.left + pad - box.left;
		else if (box.right > view.right - pad) delta = view.right - pad - box.right;
		if (delta === 0) return;

		const target = clamp(offset + nudge + delta, -loop, loop);
		nudge = target - offset;
	}
</script>

<svelte:window onblur={() => (held = false)} />

{#snippet face(item: LogoMarqueeItem)}
	{#if mark}
		<span aria-hidden="true">{@render mark(item)}</span>
		<span class="sr-only">{item.label}</span>
	{:else}
		{item.label}
	{/if}
{/snippet}

{#snippet cloneFace(item: LogoMarqueeItem)}
	{#if mark}
		{@render mark(item)}
	{:else}
		{item.label}
	{/if}
{/snippet}

{#snippet row(isLive: boolean)}
	{#each items as item (item.id)}
		<li class="shrink-0">
			{#if !isLive}
				<span class={FACE}>{@render cloneFace(item)}</span>
			{:else if item.href}
				<a href={item.href} class="{FACE} {HIT}">{@render face(item)}</a>
			{:else if onSelect}
				<button type="button" onclick={() => onSelect?.(item)} class="{FACE} {HIT}">
					{@render face(item)}
				</button>
			{:else}
				<span class={FACE}>{@render face(item)}</span>
			{/if}
		</li>
	{/each}
{/snippet}

<section
	{...restProps}
	aria-label={label}
	data-slot="logo-marquee"
	class={cn(
		'border-border bg-card relative isolate w-full max-w-full min-w-0 overflow-hidden rounded-[14px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') held = true;
	}}
	onpointerdown={() => (held = true)}
	onpointerup={(e) => {
		if (e.pointerType === 'touch') held = false;
	}}
	onpointercancel={() => (held = false)}
	onpointerleave={() => (held = false)}
	onfocusin={(e) => {
		held = true;
		if (e.target instanceof HTMLElement) reveal(e.target);
	}}
	onfocusout={() => (held = false)}
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={viewportEl}
		tabindex={reducedMotion.current ? 0 : undefined}
		onscroll={pin}
		style:overflow-x={reducedMotion.current ? 'auto' : 'hidden'}
		class="focus-visible:bg-ring/10 overflow-y-hidden py-2 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]"
	>
		<div
			bind:this={trackEl}
			style:gap="{gap}px"
			style:will-change="transform"
			class="flex w-max items-center"
		>
			{#each copyList as copy (copy)}
				{#if copy === live}
					<ul bind:this={groupEl} style:gap="{gap}px" class="flex w-max items-center">
						{@render row(true)}
					</ul>
				{:else}
					<ul aria-hidden="true" style:gap="{gap}px" class="flex w-max items-center">
						{@render row(false)}
					</ul>
				{/if}
			{/each}
		</div>
	</div>
	<div
		aria-hidden="true"
		class="from-card to-card/0 pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r"
	></div>
	<div
		aria-hidden="true"
		class="from-card to-card/0 pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l"
	></div>
</section>
