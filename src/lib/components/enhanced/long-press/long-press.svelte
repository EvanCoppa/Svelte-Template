<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The fill sweeping across the label as the hold accrues. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** The confirmation pop. Under-damped, so it overshoots and comes back. */
	const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;

	export type LongPressPhase = 'idle' | 'holding' | 'fired';

	export interface LongPressButtonProps extends Omit<
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
		/** Fires once, when the press survives the full duration. */
		onLongPress: () => void;
		/** The label. It stays the button's accessible name in every state. */
		children?: Snippet;
		/** Fires when a press is abandoned, never after it commits. */
		onCancel?: () => void;
		/** Milliseconds the press has to survive. */
		duration?: number;
		/** Cells drawn, and the render budget for the whole gesture. */
		steps?: number;
		/** Pixels of drift allowed before it is treated as a scroll. */
		moveTolerance?: number;
		/** Buzz on commit where the platform supports it. */
		haptic?: boolean;
		/** Refuses to start. */
		disabled?: boolean;
	}

	/** How long the committed state is shown before the gesture returns to rest. */
	const SETTLE_MS = 260;

	let {
		class: className,
		onLongPress,
		children,
		onCancel,
		duration = 550,
		steps = 12,
		moveTolerance = 8,
		haptic = true,
		disabled = false,
		...restProps
	}: LongPressButtonProps = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	/** Progress is reported in discrete cells, so a 550ms press costs twelve updates, not thirty-three. */
	let step = $state(0);
	let phase = $state<LongPressPhase>('idle');

	let raf = 0;
	let startedAt = 0;
	let origin: { x: number; y: number } | null = null;
	let settle: ReturnType<typeof setTimeout> | undefined;

	const cells = $derived(Math.max(1, Math.round(steps)));
	const holding = $derived(phase === 'holding');
	const fired = $derived(phase === 'fired');
	const progress = $derived(fired ? 1 : step / cells);
	const seconds = $derived(Math.round(duration / 100) / 10);

	onDestroy(() => {
		// onDestroy also runs when the server finishes rendering, where there is
		// no frame to cancel — `raf` is only ever set in the browser.
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		if (settle) clearTimeout(settle);
	});

	function reset() {
		cancelAnimationFrame(raf);
		raf = 0;
		if (settle) {
			clearTimeout(settle);
			settle = undefined;
		}
		origin = null;
		phase = 'idle';
		step = 0;
	}

	/** Every abandonment — drift, release, blur, hidden tab, Escape — lands here. */
	function end() {
		if (phase !== 'holding') return;
		reset();
		onCancel?.();
	}

	function begin(point?: { x: number; y: number }) {
		if (disabled || phase !== 'idle') return;

		phase = 'holding';
		origin = point ?? null;
		startedAt = performance.now();
		step = 0;

		const budget = cells;

		const tick = (now: number) => {
			const p = Math.min(1, (now - startedAt) / duration);
			const s = Math.floor(p * budget);
			if (s !== step) step = s;

			if (p < 1) {
				raf = requestAnimationFrame(tick);
				return;
			}

			raf = 0;
			phase = 'fired';
			step = budget;
			if (haptic) navigator.vibrate?.(12);
			onLongPress();

			settle = setTimeout(() => {
				if (phase === 'fired') reset();
			}, SETTLE_MS);
		};

		raf = requestAnimationFrame(tick);
	}

	function handlePointerDown(
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		begin({ x: event.clientX, y: event.clientY });
	}

	function handlePointerMove(event: PointerEvent) {
		if (phase !== 'holding' || !origin) return;
		// Eight pixels of drift is a scroll, not a hold.
		if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > moveTolerance) end();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.repeat) return;
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			begin();
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') end();
		if (event.key === 'Escape') end();
	}

	/** The click that follows a completed press is swallowed, or the tap action runs twice. */
	function handleClick(event: MouseEvent) {
		if (phase === 'fired') {
			event.preventDefault();
			event.stopPropagation();
		}
	}
</script>

<svelte:window onblur={end} />
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) end();
	}}
/>

<button
	{...restProps}
	type="button"
	aria-disabled={disabled}
	aria-describedby={hintId}
	data-slot="long-press-button"
	data-phase={phase}
	data-step={step}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={end}
	onpointercancel={end}
	onpointerleave={end}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	onblur={end}
	onclick={handleClick}
	oncontextmenu={(event) => event.preventDefault()}
	style:-webkit-touch-callout="none"
	class={cn(
		'group focus-visible:border-ring focus-visible:ring-ring/40 relative inline-flex h-9 touch-manipulation items-center rounded-[9px] border px-3.5 text-[13px] font-medium transition-[border-color,background-color,box-shadow,translate] duration-150 outline-none select-none focus-visible:ring-2',
		fired
			? 'border-primary bg-primary/[0.07]'
			: holding
				? 'border-border bg-muted/70 translate-y-px shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
				: 'border-border bg-card hover:bg-muted/50 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]',
		disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
		className
	)}
	{@attach motionTo(() => ({
		keyframes: { scale: reducedMotion.current ? 1 : fired ? [1, 1.045, 1] : 1 },
		transition: POP
	}))}
>
	<span class="relative grid">
		<span class="text-muted-foreground col-start-1 row-start-1 whitespace-nowrap">
			{@render children?.()}
		</span>
		<span
			aria-hidden="true"
			class="text-foreground col-start-1 row-start-1 whitespace-nowrap"
			{@attach motionTo(() => ({
				keyframes: { clipPath: `inset(0 ${((1 - progress) * 100).toFixed(2)}% 0 0)` },
				transition: CELL
			}))}
		>
			{@render children?.()}
		</span>
	</span>

	<span id={hintId} class="sr-only">
		Press and hold for {seconds} seconds to confirm
	</span>
</button>
