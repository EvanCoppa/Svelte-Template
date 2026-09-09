<script lang="ts">
	import { rangeLabel, type CalendarView } from '$lib/calendar';
	import { motionTransition, springs } from '$lib/motion.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		view,
		anchor,
		direction = 0,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		view: CalendarView;
		anchor: Date;
		/** Which way the last step went, so the label slides the same way: -1 back, 1 forward, 0 a jump. */
		direction?: -1 | 0 | 1;
	} = $props();

	const label = $derived(rangeLabel(view, anchor));
	/** How far the label travels: a step slides, a jump only fades. */
	const travel = $derived(direction * 14);
</script>

<!--
	What is on screen, said once: "September 2026", "Sep 7 – 13, 2026". The
	outgoing and incoming labels share one grid cell so the crossfade never
	moves the buttons beside it.
-->
<div
	bind:this={ref}
	data-slot="calendar-title"
	class={cn('grid min-w-0', className)}
	aria-live="polite"
	{...restProps}
>
	{#key label}
		<h2
			class="truncate text-lg font-semibold tracking-tight [grid-area:1/1]"
			in:motionTransition={{
				keyframes: { opacity: [0, 1], x: [travel, 0] },
				transition: springs.snap,
				reduced: { keyframes: { opacity: [0, 1] } }
			}}
			out:motionTransition={{
				keyframes: { opacity: [1, 0], x: [0, -travel] },
				transition: { duration: 0.12 },
				reduced: { keyframes: { opacity: [1, 0] }, transition: { duration: 0.12 } }
			}}
		>
			{label}
		</h2>
	{/key}
</div>
