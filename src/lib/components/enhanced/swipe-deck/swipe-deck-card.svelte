<script lang="ts" module>
	export type SwipeSpringSpec = { stiffness: number; damping: number; mass: number };

	/** The return flight of a card that was released short of the commit point. */
	const BOUNCE: SwipeSpringSpec = { stiffness: 260, damping: 34, mass: 1 };
	/** An undone card flying back in from the side it left. */
	const DISCLOSE: SwipeSpringSpec = { stiffness: 150, damping: 27, mass: 1 };

	/** Pixels of travel that buy the full tilt. */
	const TILT_AT = 200;
	const TILT_DEG = 8;
	/** Opacity holds flat until here, and is spent by here. */
	const FADE_FULL = 150;
	const FADE_ZERO = 340;
	/** How far a decided card travels before it stops existing. */
	const FLY = 560;
	/** Pointer travel that separates a tap from a drag. */
	const SLOP = 3;

	function tiltFor(x: number) {
		return (x / TILT_AT) * TILT_DEG;
	}

	function fadeFor(x: number) {
		const reach = Math.abs(x);
		if (reach <= FADE_FULL) return 1;
		if (reach >= FADE_ZERO) return 0;
		return 1 - (reach - FADE_FULL) / (FADE_ZERO - FADE_FULL);
	}
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { animate, motionValue } from 'motion';
	import { motionTo, motionTransition } from '$lib/motion.js';

	/** The card swelling under a grab. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Cards behind the top one settling as the stack shifts. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	interface SwipeDeckCardProps {
		/** 0 is the card being decided; everything behind it is fanned by its depth. */
		depth: number;
		/** Card height in pixels, matching the box the deck reserved. */
		height: number;
		/** Where the card starts before it settles. Non-zero only for an undone card. */
		entryX: number;
		/** Only the top card drags, answers the keyboard or shows the stamps. */
		active: boolean;
		/** One-line summary, used as the card's accessible name. */
		label: string;
		leftLabel: string;
		rightLabel: string;
		/** Side the current drag is heading for, or 0 while the deck is at rest. */
		intentDir: -1 | 0 | 1;
		/** How far into the commit the drag has travelled, quantised to 0…1. */
		progress: number;
		/** True once the drag has reached the commit point. */
		armed: boolean;
		reduced: boolean;
		/** Read at the moment of exit, so the card leaves on the side it was sent. */
		exitDir: () => -1 | 1;
		onMove: (dx: number) => void;
		/** Returns true when the deck took the card, so it is not pulled home again. */
		onRelease: (dx: number, vx: number) => boolean;
		onCancel: () => void;
		children?: Snippet;
	}

	let {
		depth,
		height,
		entryX,
		active,
		label,
		leftLabel,
		rightLabel,
		intentDir,
		progress,
		armed,
		reduced,
		exitDir,
		onMove,
		onRelease,
		onCancel,
		children
	}: SwipeDeckCardProps = $props();

	/**
	 * The card's offset lives in a Motion value so the release spring can read the
	 * velocity the drag left on it. `x` mirrors it for everything derived below.
	 */
	const offset = motionValue(0);
	let x = $state(0);

	$effect(() =>
		offset.on('change', (value: number) => {
			x = value;
		})
	);
	let dragging = $state(false);

	/** The card behind the top one rises as the commit point is approached. */
	const commit = $derived(active ? 0 : depth === 1 ? progress : 0);
	const restY = $derived(depth * 10 - commit * 10);
	const restScale = $derived(1 - depth * 0.045 + commit * 0.045);
	const tilt = $derived(tiltFor(x));
	const fade = $derived(fadeFor(x));

	let controls: { stop: () => void } | null = null;

	function stop() {
		controls?.stop();
		controls = null;
	}

	onDestroy(stop);

	// The release hands the spring the speed the gesture left on the card, so a
	// flick that falls short of the threshold springs back from where it is
	// rather than restarting from rest.
	function glide(to: number, spec: SwipeSpringSpec, exit = 0) {
		stop();

		if (reduced) {
			offset.jump(to);
			return;
		}

		controls = animate(offset, to, {
			...spec,
			type: 'spring',
			velocity: exit || offset.getVelocity()
		});
	}

	// An undone card is mounted off to the side and flies back to the middle. The
	// flight is started once per entry point, so a second undo cannot strand it.
	let flownFrom = 0;
	$effect(() => {
		const from = entryX;
		if (from === 0 || from === flownFrom) return;
		flownFrom = from;
		untrack(() => {
			x = from;
			glide(0, DISCLOSE);
		});
	});

	let pointerId: number | null = null;
	let captured = false;
	let startX = 0;
	let startY = 0;
	let originX = 0;
	let lastX = 0;
	let lastT = 0;
	let dragVelocity = 0;

	function handlePointerDown(event: PointerEvent) {
		if (!active) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		captured = false;
		startX = event.clientX;
		startY = event.clientY;
		originX = offset.get();
		lastX = event.clientX;
		lastT = event.timeStamp;
		dragVelocity = 0;
	}

	function handlePointerMove(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;

		const travel = event.clientX - startX;

		if (!captured) {
			if (Math.abs(travel) < SLOP) return;
			// Direction lock: a first move that is mostly vertical belongs to the page.
			if (Math.abs(travel) <= Math.abs(event.clientY - startY)) {
				pointerId = null;
				return;
			}
			captured = true;
			dragging = true;
			stop();
			originX = offset.get();
			startX = event.clientX;
			// SAFETY: handlePointerMove is only bound as this card's own
			// onpointermove handler, so currentTarget is the card's HTMLElement.
			(event.currentTarget as HTMLElement).setPointerCapture(pointerId);
			return;
		}

		const elapsed = Math.max(1, event.timeStamp - lastT);
		dragVelocity = ((event.clientX - lastX) / elapsed) * 1000;
		lastX = event.clientX;
		lastT = event.timeStamp;

		offset.set(originX + travel);
		onMove(x);
	}

	function handlePointerUp(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;

		// SAFETY: handlePointerUp is only bound as this card's own onpointerup
		// handler, so currentTarget is the card's HTMLElement.
		const element = event.currentTarget as HTMLElement;
		if (captured && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);

		const wasDragging = captured;
		pointerId = null;
		captured = false;
		dragging = false;
		if (!wasDragging) return;

		// A finger that came to rest before lifting is not a flick.
		const exit = event.timeStamp - lastT > 100 ? 0 : dragVelocity;
		if (onRelease(x, exit)) return;
		glide(0, BOUNCE, exit);
	}

	function handlePointerCancel(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		const wasDragging = captured;
		pointerId = null;
		captured = false;
		dragging = false;
		if (!wasDragging) return;
		onCancel();
		glide(0, BOUNCE);
	}

	// The card leaves on the side it was sent to, from wherever the finger left it.
	function leave(node: Element) {
		if (reduced) return { duration: 0 };
		const to = exitDir() * FLY;
		// SAFETY: `leave` is only ever attached via `out:leave` on this component's
		// own root div, so node is that div's HTMLElement.
		(node as HTMLElement).style.zIndex = '12';
		return motionTransition(node, {
			keyframes: {
				x: to,
				rotate: tiltFor(to),
				opacity: fadeFor(to),
				scale: 1,
				borderColor: 'transparent'
			},
			transition: { duration: 0.3, ease: [0.4, 0, 1, 1] }
		});
	}
</script>

<div
	role="group"
	aria-label={label}
	aria-hidden={active ? undefined : 'true'}
	inert={!active}
	out:leave
	style:height="{height}px"
	style:z-index={10 - depth}
	style:border-color="var(--color-border)"
	style:touch-action="pan-y"
	{@attach motionTo(
		() => ({
			keyframes: { x, rotate: tilt, opacity: fade, scale: dragging ? 1.03 : 1 },
			// The drag itself tracks the pointer exactly; only the swell springs.
			transition: { default: { duration: 0 }, scale: CELL }
		}),
		{ initial: true }
	)}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
	onlostpointercapture={handlePointerCancel}
	ondragstart={(event) => event.preventDefault()}
	class={[
		'deck-slot absolute inset-x-5 top-0 origin-bottom select-none',
		active && 'cursor-grab active:cursor-grabbing'
	]}
>
	<div
		{@attach motionTo(() => ({
			keyframes: { y: restY, scale: restScale },
			transition: { ...CROSSFADE, delay: active ? 0.1 : 0 }
		}))}
		class={[
			'relative size-full origin-bottom overflow-hidden rounded-[14px] border',
			active
				? 'bg-card shadow-[0_1px_2px_rgba(28,25,23,0.06),0_16px_32px_-18px_rgba(28,25,23,0.55)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.6)]'
				: 'bg-card shadow-[0_1px_2px_rgba(28,25,23,0.05),0_6px_14px_-12px_rgba(28,25,23,0.4)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.45)]'
		]}
		style:border-color="inherit"
	>
		{@render children?.()}

		{#if active}
			<span
				aria-hidden="true"
				{@attach motionTo(() => ({
					keyframes: {
						opacity: intentDir === -1 ? progress : 0,
						scale: intentDir === -1 ? 1 : 0.94
					},
					transition: CELL
				}))}
				class={[
					'deck-stamp-tint bg-card pointer-events-none absolute top-3 left-3 z-10 rounded-[6px] border px-2 py-1 text-[10.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase',
					intentDir === -1 && armed
						? 'border-primary text-primary'
						: 'border-border text-foreground'
				]}
			>
				{leftLabel}
			</span>
			<span
				aria-hidden="true"
				{@attach motionTo(() => ({
					keyframes: {
						opacity: intentDir === 1 ? progress : 0,
						scale: intentDir === 1 ? 1 : 0.94
					},
					transition: CELL
				}))}
				class={[
					'deck-stamp-tint bg-card pointer-events-none absolute top-3 right-3 z-10 rounded-[6px] border px-2 py-1 text-[10.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase',
					intentDir === 1 && armed ? 'border-primary text-primary' : 'border-border text-foreground'
				]}
			>
				{rightLabel}
			</span>
		{/if}
	</div>
</div>

<style>
	.deck-stamp-tint {
		transition:
			border-color 150ms ease,
			color 150ms ease;
	}
</style>
