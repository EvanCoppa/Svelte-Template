<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The assistant, as something to look at while you talk to it.
	 *
	 * Six conic gradients turning at different rates behind a heavy blur and a
	 * contrast curve: the blur melts them into one another and the contrast
	 * pulls the result back into distinct bands, which is what makes the
	 * colours look like they are moving through a liquid rather than
	 * cross-fading. Over the top, a fine grid of dots in the page's own colour,
	 * masked so it fades out towards the rim, gives the surface its grain.
	 *
	 * Every number scales off `size`, because the effect does not survive being
	 * resized on its own: at 32px the blur of a 192px orb is the whole orb, and
	 * at 320px the grain of a small one disappears. The thresholds below are the
	 * two regimes — an avatar-sized dot, and something you are meant to watch.
	 *
	 * Purely presentational: it knows how loud and how fast, never what the
	 * call is doing. `Assistant.Call` owns that translation, so the same orb
	 * can sit in a header or fill a screen.
	 */
	let {
		ref = $bindable(null),
		class: className,
		size = 192,
		level = 0,
		speed = 1,
		colors,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		/** Diameter in pixels. Everything else is derived from it. */
		size?: number;
		/** How much it is swelling right now, 0 to 1 — the voice in the room. */
		level?: number;
		/** Multiplier on the turn: 1 is at rest, higher is working. */
		speed?: number;
		/** Overrides for the four colours; anything left out follows the theme. */
		colors?: { bg?: string; c1?: string; c2?: string; c3?: string };
	} = $props();

	/**
	 * The palette. The three moving colours are the theme's primary pulled
	 * apart in hue and lifted in lightness, so the orb is recognisably this
	 * product's colour in both themes; the fourth is the ground it is cut out
	 * of, which is why it is the page's background rather than a grey.
	 */
	const palette = $derived({
		bg: colors?.bg ?? 'var(--background)',
		c1: colors?.c1 ?? 'oklch(from var(--primary) 0.74 calc(c * 1.15) calc(h - 46))',
		c2: colors?.c2 ?? 'oklch(from var(--primary) 0.82 calc(c * 0.95) calc(h + 52))',
		c3: colors?.c3 ?? 'oklch(from var(--primary) 0.78 calc(c * 1.1) calc(h + 12))'
	});

	/** Below this the orb is an avatar; above it, something to watch. */
	const SMALL = 50;
	/** Below this the grain would be larger than the orb, so it is masked away entirely. */
	const TINY = 30;
	const MEDIUM = 100;

	const small = $derived(size < SMALL);
	const blur = $derived(small ? Math.max(size * 0.008, 1) : Math.max(size * 0.015, 4));
	const dot = $derived(small ? Math.max(size * 0.004, 0.05) : Math.max(size * 0.008, 0.1));
	const shadow = $derived(small ? Math.max(size * 0.004, 0.5) : Math.max(size * 0.008, 2));

	/**
	 * Contrast is what separates the bands after the blur, so a small orb needs
	 * more of it to show anything at all — but a very small one needs almost
	 * none, because there is nothing left to separate.
	 */
	const contrast = $derived.by(() => {
		const base = small ? Math.max(size * 0.004, 1.2) : Math.max(size * 0.008, 1.5);
		if (size < TINY) return 1.1;
		return small ? Math.max(base * 1.2, 1.3) : base;
	});

	/**
	 * How far the grain reaches before it fades out — the whole `mask-image`
	 * rather than a radius, because the smaller the orb the less of it there is
	 * room to grain.
	 */
	const grain = $derived.by(() => {
		if (size < SMALL) return 'radial-gradient(black 5%, transparent 75%)';
		if (size < MEDIUM) return 'radial-gradient(black 15%, transparent 75%)';
		return 'radial-gradient(black 25%, transparent 75%)';
	});

	/**
	 * Below `TINY` the grain is not masked, it is gone: the dot grid is finer
	 * than the orb by then, so what it paints is a flat wash of the page's own
	 * colour over the whole thing — on a light ground, a white disc with a
	 * sliver of orb left at the edge. A tiny orb is just the colours.
	 */
	const grained = $derived(size < TINY ? 0 : 1);

	/** A voice swells it by a tenth at most: enough to read as breathing, never as a pump. */
	const scale = $derived(1 + Math.min(1, Math.max(0, level)) * 0.1);
	const duration = $derived(20 / Math.max(0.1, speed));
</script>

<div
	bind:this={ref}
	data-slot="assistant-orb"
	aria-hidden="true"
	class={cn('orb', className)}
	style:width="{size}px"
	style:height="{size}px"
	style:--orb-bg={palette.bg}
	style:--orb-c1={palette.c1}
	style:--orb-c2={palette.c2}
	style:--orb-c3={palette.c3}
	style:--orb-duration="{duration}s"
	style:--orb-blur="{blur}px"
	style:--orb-contrast={contrast}
	style:--orb-dot="{dot}px"
	style:--orb-shadow="{shadow}px"
	style:--orb-grain={grain}
	style:--orb-grained={grained}
	style:--orb-scale={scale}
	{...restProps}
></div>

<style>
	/* Registered so it can be animated: a custom property is a string to the
	   engine until it is told the value is an angle. */
	@property --orb-angle {
		syntax: '<angle>';
		inherits: false;
		initial-value: 0deg;
	}

	.orb {
		display: grid;
		grid-template-areas: 'stack';
		position: relative;
		overflow: hidden;
		border-radius: 50%;
		transform: scale(var(--orb-scale));
		/* The swell follows the voice, so it arrives as fast as the voice does. */
		transition: transform 120ms ease-out;
	}

	.orb::before,
	.orb::after {
		content: '';
		display: block;
		grid-area: stack;
		width: 100%;
		height: 100%;
		border-radius: 50%;
	}

	.orb::before {
		background:
			conic-gradient(
				from calc(var(--orb-angle) * 2) at 25% 70%,
				var(--orb-c3),
				transparent 20% 80%,
				var(--orb-c3)
			),
			conic-gradient(
				from calc(var(--orb-angle) * 2) at 45% 75%,
				var(--orb-c2),
				transparent 30% 60%,
				var(--orb-c2)
			),
			conic-gradient(
				from calc(var(--orb-angle) * -3) at 80% 20%,
				var(--orb-c1),
				transparent 40% 60%,
				var(--orb-c1)
			),
			conic-gradient(
				from calc(var(--orb-angle) * 2) at 15% 5%,
				var(--orb-c2),
				transparent 10% 90%,
				var(--orb-c2)
			),
			conic-gradient(
				from calc(var(--orb-angle) * 1) at 20% 80%,
				var(--orb-c1),
				transparent 10% 90%,
				var(--orb-c1)
			),
			conic-gradient(
				from calc(var(--orb-angle) * -2) at 85% 10%,
				var(--orb-c3),
				transparent 20% 80%,
				var(--orb-c3)
			);
		box-shadow: inset var(--orb-bg) 0 0 var(--orb-shadow) calc(var(--orb-shadow) * 0.2);
		filter: blur(var(--orb-blur)) contrast(var(--orb-contrast));
		animation: orb-turn var(--orb-duration) linear infinite;
	}

	.orb::after {
		background-image: radial-gradient(
			circle at center,
			var(--orb-bg) var(--orb-dot),
			transparent var(--orb-dot)
		);
		background-size: calc(var(--orb-dot) * 2) calc(var(--orb-dot) * 2);
		backdrop-filter: blur(calc(var(--orb-blur) * 2)) contrast(calc(var(--orb-contrast) * 2));
		mix-blend-mode: overlay;
		mask-image: var(--orb-grain);
		opacity: var(--orb-grained);
	}

	@keyframes orb-turn {
		to {
			--orb-angle: 360deg;
		}
	}

	/* Asked for less motion, the orb holds still and simply is: the colours are
	   the point, the turning is the flourish. */
	@media (prefers-reduced-motion: reduce) {
		.orb {
			transition: none;
		}

		.orb::before {
			animation: none;
		}
	}
</style>
