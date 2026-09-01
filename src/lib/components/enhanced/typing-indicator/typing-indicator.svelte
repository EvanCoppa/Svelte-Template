<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionEnter, motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	/** The bubble arriving. */
	const SURFACE = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;
	/** The sentence under it swapping for another. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];
	/** One full pass of the wave, in seconds. */
	const WAVE = 1.25;
	/** How long the bubble takes to lift away as a sent message. */
	const SEND = 0.34;
	const STILL = { duration: 0 } as const;

	export interface TypingIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Names currently typing, in arrival order. Empty leaves the row in place and empty. */
		typists: string[];
		/** True while the message is leaving: the bubble lifts away instead of collapsing. */
		sending?: boolean;
		/** Names printed before the label collapses to "and N others". */
		max?: number;
		/** Bubble height in pixels. Width, dots and gaps are drawn from it. */
		size?: number;
		/** False leaves the bubble alone, for a thread where the name is already on the row. */
		showLabel?: boolean;
		/** Quiet period before the sentence reaches the live region. */
		announceAfter?: number;
	}

	let {
		class: className,
		typists,
		sending = false,
		max = 2,
		size = 34,
		showLabel = true,
		announceAfter = 700,
		...restProps
	}: TypingIndicatorProps = $props();

	let announced = $state('');

	const active = $derived(typists.length > 0);
	const label = $derived(describe(typists, max));

	const width = $derived(Math.round(size * 2));
	const dot = $derived(Math.round(size * 0.23));
	const gap = $derived(Math.round(size * 0.15));
	const radius = $derived(Math.round(size * 0.47));

	function describe(names: string[], limit: number): string {
		if (names.length === 0) return '';

		const head = names.slice(0, Math.max(1, limit));
		const rest = names.length - head.length;

		if (rest > 0) {
			return `${head.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'} are typing`;
		}
		if (head.length === 1) return `${head[0]} is typing`;

		return `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]} are typing`;
	}

	// One settled sentence, so a hundred keystrokes are never a hundred announcements.
	$effect(() => {
		const settled = label;
		const timer = setTimeout(
			() => {
				announced = settled;
			},
			Math.max(0, announceAfter)
		);
		return () => clearTimeout(timer);
	});

	/** Silence collapses the bubble back into its own corner, the way it arrived. */
	function bubbleIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], scale: [0.74, 1] },
			transition: { ...SURFACE, opacity: { duration: 0.18, ease: EASE } },
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function bubbleOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.4 },
			transition: { duration: 0.26, ease: EASE },
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}

	/** The sentence swaps by crossfading in place, so the row never reflows. */
	function phraseIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], y: [7, 0] },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function phraseOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, y: -7 },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}
</script>

<div
	{...restProps}
	class={cn('inline-flex max-w-full items-end gap-3', className)}
	style:height={`${size}px`}
>
	<!-- The row reserves its full height whether or not anyone is typing. -->
	<div class="relative shrink-0" style:width={`${width}px`} style:height={`${size}px`}>
		{#if active}
			<div
				aria-hidden="true"
				class="bg-muted absolute inset-0 flex items-center justify-center"
				style:border-radius={`${radius}px`}
				style:gap={`${gap}px`}
				style:transform-origin="0% 100%"
				in:bubbleIn
				out:bubbleOut
				{@attach motionTo(() => ({
					// Sending lifts the bubble away as a message rather than collapsing it.
					keyframes:
						sending && !reducedMotion.current
							? { opacity: 0, scale: 0.45 }
							: { opacity: 1, scale: 1 },
					transition: sending ? { duration: SEND, ease: LEAVE } : SURFACE
				}))}
			>
				{#each [0, 1, 2] as index (index)}
					<span
						class="bg-muted-foreground block rounded-full"
						style:width={`${dot}px`}
						style:height={`${dot}px`}
						{@attach motionEnter(
							{ scale: [1, 0.74, 0.74, 1], opacity: [1, 0.32, 0.32, 1] },
							{
								duration: WAVE,
								times: [0, 1 / 3, 2 / 3, 1],
								ease: 'linear',
								repeat: Infinity,
								// Each dot lags the one before it by a third of a pass, so the
								// three of them read as one wave rather than three pulses.
								delay: index * (WAVE / 3)
							}
						)}
					></span>
				{/each}
			</div>
		{/if}
	</div>

	{#if showLabel}
		<span class="grid min-w-0 flex-1" style:height={`${Math.round(size * 0.6)}px`}>
			{#if label && !sending}
				{#key label}
					<span
						aria-hidden="true"
						class="text-muted-foreground col-start-1 row-start-1 self-center truncate text-[13px]"
						in:phraseIn
						out:phraseOut
					>
						{label}
					</span>
				{/key}
			{/if}
		</span>
	{/if}

	<span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{announced}</span>
</div>
