<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The bar filling as the article scrolls. */
	const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
	/** The readout handing over to the finished mark. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** The tick drawing itself, a beat after the label has faded in. */
	const DRAW = { duration: 0.3, ease: EASE, delay: 0.08 } as const;

	export interface ReadingProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The article element. Progress runs from its top edge to its last visible line, so headers and footers outside it never count as reading. */
		target?: HTMLElement | null;
		/** The scroll container, when the article lives in a pane rather than the document. Omit for window scrolling. */
		scroller?: HTMLElement | null;
		/** How finely the scroll is quantized, and therefore the maximum number of updates a full scroll can cost. */
		steps?: number;
		/** Word count of the article. Above zero the readout is minutes remaining; at zero the track is the whole component. */
		words?: number;
		/** Reading rate used for the estimate. */
		wordsPerMinute?: number;
		/** Accessible name of the progressbar. */
		label?: string;
		/** Replaces the estimate once the last step lights. */
		doneLabel?: string;
	}

	let {
		class: className,
		target = null,
		scroller = null,
		steps = 24,
		words = 0,
		wordsPerMinute = 220,
		label = 'Reading progress',
		doneLabel = 'End',
		...restProps
	}: ReadingProgressProps = $props();

	/** The quantized scroll position. One discrete number, never a per-frame float. */
	let step = $state(0);

	const quantum = $derived(Math.max(1, Math.round(steps)));
	const progress = $derived(step / quantum);
	const percent = $derived(Math.round(progress * 100));
	const complete = $derived(step >= quantum);

	const estimate = $derived(words > 0);
	const rate = $derived(Math.max(1, wordsPerMinute));
	const totalMinutes = $derived(words > 0 ? Math.max(1, Math.ceil(words / rate)) : 0);
	const minutesLeft = $derived(words > 0 ? Math.ceil(((1 - progress) * words) / rate) : 0);

	const readout = $derived(`${minutesLeft} min left`);
	const finish = $derived(`${doneLabel} · ${totalMinutes} min`);
	const valueText = $derived(estimate ? `${percent}% read, ${readout}` : `${percent}% read`);

	function clamp01(n: number) {
		if (!Number.isFinite(n) || n < 0) return 0;
		return n > 1 ? 1 : n;
	}

	// Scroll is read inside a single coalesced frame and committed only when the
	// quantized step changes, so a fast flick costs at most `steps` updates.
	$effect(() => {
		const scrollEl = scroller;
		const targetEl = target;
		const cells = quantum;

		let frame = 0;
		let committed = -1;

		const read = () => {
			frame = 0;

			const viewport = scrollEl ? scrollEl.clientHeight : window.innerHeight;

			let ratio: number;
			if (targetEl) {
				const rect = targetEl.getBoundingClientRect();
				const base = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
				const travel = rect.height - viewport;
				ratio = travel <= 0 ? 1 : (base - rect.top) / travel;
			} else if (scrollEl) {
				const travel = scrollEl.scrollHeight - scrollEl.clientHeight;
				ratio = travel <= 0 ? 1 : scrollEl.scrollTop / travel;
			} else {
				const doc = document.documentElement;
				const travel = doc.scrollHeight - viewport;
				ratio = travel <= 0 ? 1 : window.scrollY / travel;
			}

			const next = Math.round(clamp01(ratio) * cells);
			if (next === committed) return;
			committed = next;
			step = next;
		};

		const schedule = () => {
			if (frame) return;
			frame = requestAnimationFrame(read);
		};

		const source: EventTarget = scrollEl ?? window;
		source.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);

		// Content that grows after mount must not freeze the track at a stale height.
		const observer = new ResizeObserver(schedule);
		if (targetEl) observer.observe(targetEl);
		if (scrollEl) observer.observe(scrollEl);
		if (!targetEl && !scrollEl) observer.observe(document.documentElement);

		read();

		return () => {
			source.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			observer.disconnect();
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
	});
</script>

<div {...restProps} class={cn('flex items-center gap-3', className)}>
	<div
		role="progressbar"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={quantum}
		aria-valuenow={step}
		aria-valuetext={valueText}
		class="bg-muted min-w-0 flex-1 rounded-[4px] p-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
	>
		<div
			aria-hidden="true"
			class="bg-primary h-[3px] w-full origin-left rounded-[2px]"
			{@attach motionTo(() => ({ keyframes: { scaleX: progress }, transition: FILL }))}
		></div>
	</div>

	{#if estimate}
		<div class="grid shrink-0 justify-items-end font-mono text-[10.5px] tabular-nums">
			<!-- Sized up front by the longest string the cell can ever hold. -->
			<span
				aria-hidden="true"
				class="invisible col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap"
			>
				<span class="w-3 shrink-0"></span>
				{finish}
			</span>

			<span
				aria-hidden="true"
				class="text-muted-foreground col-start-1 row-start-1 whitespace-nowrap"
				{@attach motionTo(() => ({
					keyframes: { opacity: complete ? 0 : 1 },
					transition: CROSSFADE
				}))}
			>
				{readout}
			</span>

			<span
				aria-hidden="true"
				class="text-foreground col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap"
				{@attach motionTo(() => ({
					keyframes: { opacity: complete ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				<svg width="12" height="12" viewBox="0 0 256 256" fill="none" aria-hidden="true">
					<polyline
						points="216 72 104 184 48 128"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
						{@attach motionTo(() => ({
							keyframes: { pathLength: complete ? 1 : 0 },
							transition: DRAW
						}))}
					/>
				</svg>
				<span
					{@attach motionTo(() => ({
						keyframes: { x: complete ? 0 : 4 },
						transition: CROSSFADE
					}))}
				>
					{finish}
				</span>
			</span>
		</div>
	{/if}
</div>
