<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The resting label handing over to the confirmed one. */
	const FACE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	/** The sweep unwinding after an early release. */
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

	export type HoldPhase = 'idle' | 'holding' | 'releasing' | 'committed';

	export interface HoldToConfirmProps extends Omit<
		HTMLButtonAttributes,
		| 'children'
		| 'disabled'
		| 'onclick'
		| 'oncontextmenu'
		| 'onpointerdown'
		| 'onpointermove'
		| 'onpointerup'
		| 'onpointercancel'
		| 'onpointerleave'
		| 'onkeydown'
		| 'onkeyup'
		| 'onblur'
	> {
		/** Fires once, only when the hold reaches full duration. A click never reaches it. */
		onConfirm: () => void;
		/** The resting label. It stays the button's accessible name in every state. */
		children?: Snippet;
		/** Fires the moment a hold is released early, including a stray click. */
		onAbort?: () => void;
		confirmLabel?: string;
		/** Milliseconds of continuous hold required. */
		duration?: number;
		/** Milliseconds the confirmed state is held before returning to rest. 0 keeps it confirmed. */
		resetAfter?: number;
		/** Sampling budget for the hold; the sweep runs as one continuous animation regardless. */
		steps?: number;
		/** How many times faster progress drains than it fills when you let go. */
		releaseRate?: number;
		moveTolerance?: number;
		disabled?: boolean;
	}

	let {
		class: className,
		onConfirm,
		children,
		onAbort,
		confirmLabel = 'Confirmed',
		duration = 1800,
		resetAfter = 1600,
		steps = 20,
		releaseRate = 2.5,
		moveTolerance = 10,
		disabled = false,
		...restProps
	}: HoldToConfirmProps = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	let phase = $state<HoldPhase>('idle');
	let step = $state(0);

	let down = false;
	let elapsed = 0;
	let last = 0;
	let raf = 0;
	let origin: { x: number; y: number } | null = null;
	let commitTimer: ReturnType<typeof setTimeout> | undefined;

	// The sweep is one continuous clip-path transition; these drive it per phase change.
	let sweepTarget = $state(0);
	let sweepMs = $state(0);
	let sweepEase = $state<'linear' | [number, number, number, number]>('linear');

	const committed = $derived(phase === 'committed');
	const seconds = $derived(Math.round(duration / 100) / 10);

	onDestroy(() => {
		// onDestroy also runs when the server finishes rendering, where there is
		// no frame to cancel — `raf` is only ever set in the browser.
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		if (commitTimer) clearTimeout(commitTimer);
	});

	function sweep(next: HoldPhase, fraction: number) {
		if (reducedMotion.current) {
			sweepMs = 0;
			sweepTarget = next === 'holding' || next === 'committed' ? 1 : 0;
			return;
		}
		if (next === 'committed') {
			sweepTarget = 1;
			sweepMs = 120;
			sweepEase = 'linear';
			return;
		}
		if (next === 'holding') {
			sweepTarget = 1;
			sweepMs = Math.max(0, duration * (1 - fraction));
			sweepEase = 'linear';
			return;
		}
		sweepTarget = 0;
		sweepMs = Math.max(0, (duration * fraction) / releaseRate);
		sweepEase = EASE;
	}

	function move(next: HoldPhase) {
		sweep(next, Math.min(1, Math.max(0, elapsed / duration)));
		phase = next;
	}

	function reset() {
		cancelAnimationFrame(raf);
		raf = 0;
		if (commitTimer) {
			clearTimeout(commitTimer);
			commitTimer = undefined;
		}
		down = false;
		origin = null;
		step = 0;
		move('idle');
		elapsed = 0;
	}

	function loop(now: number) {
		const dt = Math.min(64, now - last);
		last = now;
		elapsed += down ? dt : -dt * releaseRate;

		if (elapsed >= duration) {
			raf = 0;
			elapsed = duration;
			down = false;
			origin = null;
			step = steps;
			move('committed');
			if (resetAfter > 0) commitTimer = setTimeout(reset, resetAfter);
			navigator.vibrate?.(14);
			onConfirm();
			return;
		}

		if (elapsed <= 0) {
			raf = 0;
			elapsed = 0;
			origin = null;
			step = 0;
			move('idle');
			return;
		}

		const s = Math.min(steps, Math.floor((elapsed / duration) * steps));
		if (s !== step) step = s;
		raf = requestAnimationFrame(loop);
	}

	function begin(point?: { x: number; y: number }) {
		if (disabled) return;
		if (phase === 'committed' || phase === 'holding') return;

		origin = point ?? null;
		down = true;
		move('holding');
		if (raf) return;

		last = performance.now();
		raf = requestAnimationFrame(loop);
	}

	function release() {
		if (phase !== 'holding') return;
		down = false;
		origin = null;
		move('releasing');
		onAbort?.();
	}

	function handlePointerDown(
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		begin({ x: event.clientX, y: event.clientY });
	}

	function handlePointerMove(event: PointerEvent) {
		if (phase !== 'holding' || !origin) return;
		if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > moveTolerance) {
			release();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (phase === 'holding' || phase === 'releasing') {
				event.preventDefault();
				reset();
			}
			return;
		}
		if (event.repeat) return;
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			begin();
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') release();
	}

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		if (phase === 'committed') event.stopPropagation();
	}
</script>

<svelte:window onblur={() => release()} />
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) release();
	}}
/>

{#snippet faces()}
	<span class="col-start-1 row-start-1 grid">
		<span
			class={cn('col-start-1 row-start-1 flex items-center justify-center whitespace-nowrap')}
			{@attach motionTo(() => ({ keyframes: { opacity: committed ? 0 : 1 }, transition: FACE }))}
		>
			{@render children?.()}
		</span>
		<span
			class={cn(
				'col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap'
			)}
			{@attach motionTo(() => ({ keyframes: { opacity: committed ? 1 : 0 }, transition: FACE }))}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M2.5 6.4 4.7 8.6 9.5 3.5" />
			</svg>
			{confirmLabel}
		</span>
	</span>
{/snippet}

<button
	{...restProps}
	type="button"
	aria-disabled={disabled || committed}
	aria-describedby={hintId}
	data-slot="hold-to-confirm"
	data-phase={phase}
	data-step={step}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={release}
	onpointercancel={release}
	onpointerleave={release}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	onblur={release}
	onclick={handleClick}
	oncontextmenu={(event) => event.preventDefault()}
	style:-webkit-touch-callout="none"
	class={cn(
		'border-border bg-card text-foreground focus-visible:ring-ring relative isolate inline-grid h-10 touch-manipulation place-items-center overflow-hidden rounded-[9px] border px-4 text-[13px] font-medium outline-none select-none focus-visible:ring-2',
		disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
		className
	)}
>
	{@render faces()}

	<span
		aria-hidden="true"
		class="bg-primary text-primary-foreground absolute inset-0 grid place-items-center px-4"
		{@attach motionTo(
			() => ({
				keyframes: { clipPath: `inset(0 ${(1 - sweepTarget) * 100}% 0 0)` },
				transition: { duration: sweepMs / 1000, ease: sweepEase }
			}),
			{ initial: true }
		)}
	>
		{@render faces()}
	</span>

	<span id={hintId} class="sr-only">
		Press and hold for {seconds} seconds to confirm. Releasing early cancels and nothing happens.
	</span>

	<span role="status" aria-live="polite" class="sr-only">
		{committed ? confirmLabel : ''}
	</span>
</button>
