<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The caret and the skip label fading between states. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export type StreamingTextStatus = 'idle' | 'streaming' | 'paused' | 'done';

	export interface StreamingTextProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The full response. It is laid out on the first frame; only the reveal is paced. */
		text: string;
		/** Reveal speed, in tokens (roughly four characters) per second. */
		tokensPerSecond?: number;
		/** Start revealing immediately on mount. */
		autoStart?: boolean;
		/** Show the Skip / Replay affordance under the text. */
		showSkip?: boolean;
		/** Accessible name for the group, also used by the replay label. */
		label?: string;
		/** Called once the full text is revealed. */
		onDone?: () => void;
	}

	const CHARS_PER_TOKEN = 4;
	const MAX_FRAME_DELTA = 64;

	let {
		class: className,
		text,
		tokensPerSecond = 18,
		autoStart = true,
		showSkip = true,
		label = 'Streamed response',
		onDone,
		...restProps
	}: StreamingTextProps = $props();

	let index = $state(0);
	let status = $state<StreamingTextStatus>(autoStart ? 'streaming' : 'idle');

	let cursor = 0;
	let lastText = text;
	let lastAutoStart = autoStart;

	const total = $derived(text.length);
	const visible = $derived(text.slice(0, index));
	const done = $derived(status === 'done');
	const blink = $derived(!reducedMotion.current && (status === 'idle' || status === 'paused'));

	// Restart from zero when the text (or autoStart) changes.
	$effect(() => {
		if (text === lastText && autoStart === lastAutoStart) return;
		lastText = text;
		lastAutoStart = autoStart;
		cursor = 0;
		index = 0;
		status = autoStart ? 'streaming' : 'idle';
	});

	// Advance on accumulated elapsed time with the per-frame delta clamped, so a
	// tab returning from the background does not dump the rest in one frame.
	$effect(() => {
		// Animation frames only exist in the browser. Keep the server render
		// deterministic and let the client effect start after hydration.
		if (!('window' in globalThis)) return;
		if (status !== 'streaming') return;

		if (reducedMotion.current || cursor >= total) {
			cursor = total;
			index = total;
			status = 'done';
			return;
		}

		const interval = 1000 / Math.max(1, tokensPerSecond * CHARS_PER_TOKEN);
		let frame = 0;
		let last = performance.now();
		let carry = 0;

		const tick = (now: number) => {
			carry += Math.min(now - last, MAX_FRAME_DELTA);
			last = now;

			if (carry >= interval) {
				const advance = Math.floor(carry / interval);
				carry -= advance * interval;
				const next = Math.min(total, cursor + advance);
				cursor = next;
				index = next;
				if (next >= total) {
					status = 'done';
					return;
				}
			}

			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// Under prefers-reduced-motion the whole answer is present immediately.
	$effect(() => {
		if (!reducedMotion.current) return;
		cursor = total;
		index = total;
		status = 'done';
	});

	$effect(() => {
		if (status === 'done') onDone?.();
	});

	function skip() {
		cursor = total;
		index = total;
		status = 'done';
	}

	function replay() {
		cursor = 0;
		index = 0;
		status = 'streaming';
	}
</script>

<div
	{...restProps}
	role="group"
	aria-label={label}
	aria-busy={status === 'streaming'}
	class={cn('text-foreground text-[13.5px] leading-relaxed', className)}
>
	<p aria-hidden="true" class="relative whitespace-pre-line">
		<span class="invisible">{text}</span>

		<span class="absolute inset-0 whitespace-pre-line"
			>{visible}<span class="relative inline-block h-[1.1em] w-0 align-[-0.22em]"
				><span
					class={cn('bg-foreground absolute inset-y-0 left-px block w-[2px]')}
					{@attach motionTo(
						() => ({
							keyframes: blink ? { opacity: [1, 1, 0, 0] } : { opacity: done ? 0 : 1 },
							transition: blink
								? {
										duration: 1.06,
										times: [0, 0.45, 0.5, 0.95],
										repeat: Infinity,
										ease: 'linear'
									}
								: CROSSFADE
						}),
						{ initial: true }
					)}
				></span></span
			></span
		>
	</p>

	<span role="status" aria-live="polite" class="sr-only">{done ? text : ''}</span>

	{#if showSkip}
		<div class="mt-2.5 flex justify-end">
			<button
				type="button"
				onclick={done ? replay : skip}
				aria-label={done ? `Replay ${label}` : 'Skip to the end'}
				class="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-grid h-7 cursor-pointer place-items-center rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
			>
				<span
					aria-hidden="true"
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({
						keyframes: { opacity: done ? 0 : 1 },
						transition: CROSSFADE
					}))}
				>
					Skip
				</span>
				<span
					aria-hidden="true"
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({
						keyframes: { opacity: done ? 1 : 0 },
						transition: CROSSFADE
					}))}
				>
					Replay
				</span>
			</button>
		</div>
	{/if}
</div>
