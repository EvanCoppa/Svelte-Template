<script lang="ts" module>
	/**
	 * How full a ring is drawn. A fraction is how far along the work is; the
	 * three words are the states a fraction cannot say — not started, finished,
	 * and finished badly.
	 */
	export type KanbanRingFill = number | 'empty' | 'done' | 'stopped';
</script>

<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { BADGE_TONE_TEXT_CLASSES, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * A status as a ring filling up: the column header wears one, and so does
	 * every card, which is what lets a card under "In progress" say "Blocked"
	 * without a second pill repeating the column's own name.
	 *
	 * It is a picture of a value, not a control, and carries the tone the same
	 * value's pill would — one hue per status across the board, the pills and
	 * the list.
	 */
	let {
		class: className,
		tone = 'neutral',
		fill = 'empty',
		label,
		...restProps
		// `fill` is an SVG attribute name too, and this one is not a paint: the
		// ring's colour comes from its tone, and this says how much of it to
		// draw. Omitted from the passthrough so the two do not intersect into
		// the handful of values they have in common.
	}: Omit<SVGAttributes<SVGElement>, 'fill'> & {
		tone?: BadgeTone;
		/** How far along this status sits, or which of the three ends it is. */
		fill?: KanbanRingFill;
		/**
		 * The status in words. Given, the ring is announced; left out it is
		 * decoration, which is the right answer when the label is next to it.
		 */
		label?: string;
	} = $props();

	/** Ring geometry, in the 16-unit box the viewBox sets up. */
	const CENTRE = 8;
	const RING = 6;
	const PIE = 3.8;

	/** The slice a fraction fills, clockwise from noon. */
	function slice(fraction: number): string {
		const clamped = Math.min(Math.max(fraction, 0), 1);
		if (clamped >= 1) {
			return `M ${String(CENTRE)} ${String(CENTRE - PIE)} A ${String(PIE)} ${String(PIE)} 0 1 1 ${String(CENTRE - 0.001)} ${String(CENTRE - PIE)} Z`;
		}
		const angle = clamped * 2 * Math.PI;
		const x = CENTRE + PIE * Math.sin(angle);
		const y = CENTRE - PIE * Math.cos(angle);
		const long = clamped > 0.5 ? 1 : 0;
		return `M ${String(CENTRE)} ${String(CENTRE)} L ${String(CENTRE)} ${String(CENTRE - PIE)} A ${String(PIE)} ${String(PIE)} 0 ${String(long)} 1 ${String(x)} ${String(y)} Z`;
	}
</script>

<svg
	viewBox="0 0 16 16"
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	class={cn('size-4 shrink-0', BADGE_TONE_TEXT_CLASSES[tone], className)}
	{...restProps}
>
	{#if fill === 'empty'}
		<!-- Nothing has happened yet, so the ring is not even solid. -->
		<circle
			cx={CENTRE}
			cy={CENTRE}
			r={RING}
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-dasharray="2.2 2.4"
			stroke-linecap="round"
		/>
	{:else}
		<circle cx={CENTRE} cy={CENTRE} r={RING} fill="none" stroke="currentColor" stroke-width="1.6" />
		{#if fill === 'done' || fill === 'stopped'}
			<circle cx={CENTRE} cy={CENTRE} r={PIE} fill="currentColor" />
			<!-- The mark is cut out of the fill rather than drawn over it, so it
			     stays legible against whatever the card's surface is. -->
			<path
				d={fill === 'done'
					? 'M5.2 8.1 L7.1 10.1 L10.8 6.2'
					: 'M5.8 5.8 L10.2 10.2 M10.2 5.8 L5.8 10.2'}
				fill="none"
				class="stroke-card"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}
			<path d={slice(fill)} fill="currentColor" />
		{/if}
	{/if}
</svg>
