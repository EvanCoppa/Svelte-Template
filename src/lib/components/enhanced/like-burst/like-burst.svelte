<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionEnter, motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** The filled heart popping in behind the outline. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Outline, labels and the count trading places. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	/** Sync throws and rejected promises both settle back to the last confirmed state. */
	export type LikeCommit = (liked: boolean, signal: AbortSignal) => void;

	export interface LikeBurstProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** Server truth at mount. Read once — the component owns the value afterwards. */
		initialLiked?: boolean;
		/** Server truth at mount. Both reachable counts reserve width up front. */
		initialCount?: number;
		/** Called once per settled intent, never once per tap. Reject to roll back. */
		onCommit?: LikeCommit;
		/** Fires after the UI has already rolled back to the last confirmed state. */
		onError?: (cause: unknown) => void;
		/** Fires on every tap with the intended state. For analytics, not for writes. */
		onToggle?: (liked: boolean) => void;
		/** Milliseconds of quiet before intent is committed. */
		settle?: number;
		label?: string;
		activeLabel?: string;
		/** Formats the count. Must be pure and locale-fixed — it runs on the server too. */
		format?: (value: number) => string;
		disabled?: boolean;
	}

	const HEART = 'M12 20.3 4.3 12.6a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 0 1 6.8 6.8Z';

	const SPARKS = Array.from({ length: 8 }, (_, i) => {
		const h = (((i + 1) * 2654435761) % 997) / 997;
		const angle = (i / 8) * Math.PI * 2 - Math.PI / 2 + (h - 0.5) * 0.4;
		const distance = 13 + h * 9;
		return {
			id: i,
			x: Math.round(Math.cos(angle) * distance * 10) / 10,
			y: Math.round(Math.sin(angle) * distance * 10) / 10,
			size: h > 0.5 ? 4 : 3,
			delay: Math.round(h * 50) / 1000
		};
	});

	const NUMBERS = new Intl.NumberFormat('en-US');

	let {
		class: className,
		initialLiked = false,
		initialCount = 0,
		onCommit,
		onError,
		onToggle,
		settle = 400,
		label = 'Like',
		activeLabel = 'Liked',
		format = (value: number) => NUMBERS.format(value),
		disabled = false,
		...restProps
	}: LikeBurstProps = $props();

	let liked = $state(initialLiked);
	let count = $state(initialCount);
	let pending = $state(false);
	let burst = $state(0);
	let settled = $state({ liked: initialLiked, count: initialCount });

	// Intent lives outside reactive state so a burst of taps is never a burst of renders.
	let likedNow = initialLiked;
	let countNow = initialCount;
	let truth = { liked: initialLiked, count: initialCount };
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: AbortController | null = null;
	let seq = 0;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		timer = null;
		seq += 1;
		inFlight?.abort();
		inFlight = null;
	});

	function flush() {
		timer = null;
		inFlight?.abort();
		inFlight = null;
		seq += 1;

		const intent = likedNow;

		// A burst that lands back on the confirmed state sends nothing at all.
		if (intent === truth.liked) {
			countNow = truth.count;
			liked = truth.liked;
			count = truth.count;
			pending = false;
			return;
		}

		const target = { liked: intent, count: countNow };
		const run = onCommit;

		if (!run) {
			truth = target;
			settled = target;
			pending = false;
			return;
		}

		const controller = new AbortController();
		const id = seq;
		inFlight = controller;
		pending = true;

		Promise.resolve()
			.then(() => run(intent, controller.signal))
			.then(
				() => {
					if (id !== seq) return;
					inFlight = null;
					truth = target;
					settled = target;
					pending = false;
				},
				(cause: unknown) => {
					if (id !== seq) return;
					inFlight = null;
					likedNow = truth.liked;
					countNow = truth.count;
					liked = truth.liked;
					count = truth.count;
					pending = false;
					onError?.(cause);
				}
			);
	}

	/** Flip the like. Exposed so a card or a keyboard shortcut can drive the same optimistic path. */
	export function toggle() {
		const next = !likedNow;
		likedNow = next;
		countNow += next ? 1 : -1;

		liked = next;
		count = countNow;
		pending = true;
		if (next) burst += 1;

		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, Math.max(0, settle));
	}

	function handleClick() {
		if (disabled) return;
		const next = !liked;
		toggle();
		onToggle?.(next);
	}

	const base = $derived(liked ? count - 1 : count);
	const low = $derived(format(base));
	const high = $derived(format(base + 1));
	const widest = $derived(high.length >= low.length ? high : low);
	const shown = $derived(format(count));
</script>

<span {...restProps} data-slot="like-burst" class={cn('inline-flex items-center', className)}>
	<button
		type="button"
		{disabled}
		aria-pressed={liked}
		aria-busy={pending}
		aria-label={label}
		data-liked={liked ? '' : undefined}
		onclick={handleClick}
		class="border-border bg-card text-foreground focus-visible:ring-ring/50 inline-flex h-9 touch-manipulation items-center gap-2 rounded-[9px] border px-3 text-[13px] font-medium outline-none select-none focus-visible:ring-2 disabled:opacity-50"
	>
		<span aria-hidden="true" class="relative block size-[18px]">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linejoin="round"
				class="text-muted-foreground absolute inset-0 size-[18px]"
				{@attach motionTo(() => ({
					keyframes: { opacity: liked ? 0 : 1 },
					transition: CROSSFADE
				}))}
			>
				<path d={HEART} />
			</svg>

			<svg
				viewBox="0 0 24 24"
				fill="currentColor"
				class="text-foreground absolute inset-0 size-[18px]"
				{@attach motionTo(() => ({
					keyframes: { opacity: liked ? 1 : 0, scale: liked ? 1 : 0.55 },
					transition: CELL
				}))}
			>
				<path d={HEART} />
			</svg>

			{#key burst}
				{#if burst > 0 && !reducedMotion.current}
					<span class="pointer-events-none absolute top-1/2 left-1/2 block size-0">
						{#each SPARKS as spark (spark.id)}
							<span
								class="bg-foreground absolute block rounded-[1.5px]"
								style:width="{spark.size}px"
								style:height="{spark.size}px"
								style:margin-left="{-spark.size / 2}px"
								style:margin-top="{-spark.size / 2}px"
								{@attach motionEnter(
									{ x: [0, spark.x], y: [0, spark.y], scale: [0.6, 1], opacity: [0.85, 0] },
									{ duration: 0.44, delay: spark.delay, ease: EASE }
								)}
							></span>
						{/each}
					</span>
				{/if}
			{/key}
		</span>

		<span aria-hidden="true" class="grid">
			<span
				class="col-start-1 row-start-1"
				{@attach motionTo(() => ({
					keyframes: { opacity: liked ? 0 : 1 },
					transition: CROSSFADE
				}))}>{label}</span
			>
			<span
				class="col-start-1 row-start-1"
				{@attach motionTo(() => ({
					keyframes: { opacity: liked ? 1 : 0 },
					transition: CROSSFADE
				}))}>{activeLabel}</span
			>
		</span>

		<span
			aria-hidden="true"
			class="text-muted-foreground grid overflow-hidden text-[12px] tabular-nums"
		>
			<span class="invisible col-start-1 row-start-1">{widest}</span>
			{#key shown}
				<span
					class="col-start-1 row-start-1 justify-self-end"
					in:motionTransition={{
						keyframes: { opacity: [0, 1], y: [-7, 0] },
						transition: CROSSFADE,
						reduced: { keyframes: { opacity: [0, 1] }, transition: { duration: 0 } }
					}}
					out:motionTransition={{
						keyframes: { opacity: 0, y: 7 },
						transition: CROSSFADE,
						reduced: { keyframes: { opacity: 0 }, transition: { duration: 0 } }
					}}
				>
					{shown}
				</span>
			{/key}
		</span>
	</button>

	<span role="status" aria-live="polite" class="sr-only">
		{`${format(settled.count)} likes, ${settled.liked ? 'liked' : 'not liked'}`}
	</span>
</span>
