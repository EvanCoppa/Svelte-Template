<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	/** The tint washing in behind the figure. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** The figure rolling in from the direction it moved. */
	const ROLL = { type: 'spring', stiffness: 460, damping: 32, mass: 0.55 } as const;
	/** The direction mark popping in. Under-damped, so it overshoots. */
	const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
	/** The whole figure swelling as it flashes. */
	const LIFT = { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 } as const;
	/** And coming back down once the flash has been held long enough. */
	const SETTLE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	const OUT: [number, number, number, number] = [0.4, 0, 1, 1];
	const CLEAR = { duration: 0.16, ease: OUT } as const;
	const DROP = { duration: 0.14, ease: OUT } as const;
	const STILL = { duration: 0 } as const;

	export type FlashDirection = 'up' | 'down';

	export interface ValueFlashProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** The number to watch. A change of identity, not of render, is what marks it. */
		value: number;
		/** Formats the displayed text. Rendered with tabular-nums so equal-length values never jitter. */
		format?: (value: number) => string;
		/** Prefixes the live-region announcement, so a screen reader hears which figure moved. */
		label?: string;
		/** Milliseconds the tint and direction mark stay lit before clearing themselves. */
		hold?: number;
		/** Quiet period before the settled value is announced. Each new change restarts it. */
		announceAfter?: number;
	}

	let {
		class: className,
		value,
		format,
		label,
		hold = 900,
		announceAfter = 700,
		...restProps
	}: ValueFlashProps = $props();

	let direction = $state<FlashDirection | null>(null);
	let changeId = $state(0);
	let flashing = $state(false);

	const text = $derived(format ? format(value) : String(value));

	let settled = $state(format ? format(value) : String(value));

	// Seeded at mount so a hydrated value never flashes on first paint.
	let previous = value;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (holdTimer) clearTimeout(holdTimer);
	});

	$effect(() => {
		const next = value;
		const wait = hold;
		untrack(() => {
			if (Object.is(previous, next)) return;
			const prior = previous;
			previous = next;

			const delta = next - prior;
			if (delta === 0) return;

			direction = delta > 0 ? 'up' : 'down';
			changeId += 1;
			flashing = true;

			if (holdTimer) clearTimeout(holdTimer);
			holdTimer = setTimeout(() => {
				holdTimer = undefined;
				flashing = false;
			}, wait);
		});
	});

	$effect(() => {
		const next = text;
		const id = setTimeout(() => {
			settled = next;
		}, announceAfter);
		return () => clearTimeout(id);
	});

	function rollIn(node: Element) {
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				y: [direction === 'down' ? '-0.85em' : '0.85em', '0em'],
				filter: ['blur(5px)', 'blur(0px)']
			},
			transition: ROLL,
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function rollOut(node: Element) {
		return motionTransition(node, {
			keyframes: {
				opacity: 0,
				y: direction === 'down' ? '0.7em' : '-0.7em',
				filter: 'blur(4px)'
			},
			transition: DROP,
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}

	function popIn(node: Element) {
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				scale: [0.4, 1],
				y: [direction === 'up' ? '0.3em' : '-0.3em', '0em']
			},
			transition: POP,
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function popOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.8 },
			transition: CLEAR,
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}
</script>

<span
	{...restProps}
	class={cn(
		'relative inline-grid grid-flow-col items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-[13px] font-medium tabular-nums transition-colors duration-200',
		flashing
			? direction === 'up'
				? 'text-emerald-600 dark:text-emerald-400'
				: 'text-red-600 dark:text-red-400'
			: 'text-foreground',
		className
	)}
	{@attach motionTo(() => ({
		keyframes: { scale: reducedMotion.current ? 1 : flashing ? 1.05 : 1 },
		transition: flashing ? LIFT : SETTLE
	}))}
>
	{#if direction}
		<span
			aria-hidden="true"
			class={cn(
				'pointer-events-none absolute inset-0 rounded-[6px]',
				direction === 'up'
					? 'bg-emerald-500/[0.12] dark:bg-emerald-400/[0.14]'
					: 'bg-red-500/[0.12] dark:bg-red-400/[0.14]'
			)}
			style:opacity="0"
			{@attach motionTo(
				() => ({
					keyframes: { opacity: flashing ? 1 : 0 },
					transition: reducedMotion.current ? STILL : flashing ? CELL : CLEAR
				}),
				{ initial: true }
			)}
		></span>
	{/if}

	<span aria-hidden="true" class="relative inline-grid overflow-hidden">
		{#key changeId}
			<span in:rollIn out:rollOut class="col-start-1 row-start-1">{text}</span>
		{/key}
	</span>
	<span aria-hidden="true" class="relative grid size-[1em] place-items-center">
		{#if flashing && direction}
			{#key `${changeId}-${direction}`}
				<svg
					viewBox="0 0 256 256"
					fill="currentColor"
					in:popIn
					out:popOut
					class="col-start-1 row-start-1 block h-[0.68em] w-[0.68em]"
				>
					{#if direction === 'up'}
						<path d="M128 68 L210 180 H46 Z" />
					{:else}
						<path d="M128 188 L46 76 H210 Z" />
					{/if}
				</svg>
			{/key}
		{/if}
	</span>
	<span class="sr-only" aria-live="polite">{label ? `${label}: ${settled}` : settled}</span>
</span>
