<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** Where a unit sits before its turn comes, and where it lands. */
	const HIDDEN = { opacity: 0, y: 10, filter: 'blur(8px)' } as const;
	const SHOWN = { opacity: 1, y: 0, filter: 'blur(0px)' } as const;

	const DURATION = 0.6;

	export type TextRevealSplit = 'word' | 'character';

	export interface TextRevealProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** The sentence or paragraph to reveal. */
		text: string;
		/** Reveal whole words or individual characters. */
		by?: TextRevealSplit;
		/** Delay between units, in seconds. Clamped so the whole run fits in `maxDuration`. */
		stagger?: number;
		/** Upper bound for the full reveal, in seconds. */
		maxDuration?: number;
		/** Wait until the element scrolls into view before playing. */
		startOnView?: boolean;
		/** Gate the reveal manually. */
		play?: boolean;
		/** Only play the first time the element enters the viewport. */
		once?: boolean;
		/** Fraction of the element that must be visible to count as in view. */
		amount?: number;
	}

	let {
		class: className,
		text,
		by = 'word',
		stagger = 0.055,
		maxDuration = 1.6,
		startOnView = true,
		play = true,
		once = true,
		amount = 0.35,
		...restProps
	}: TextRevealProps = $props();

	let inView = $state(false);

	const split = $derived.by(() => {
		const words = text.trim().length ? text.trim().split(/\s+/) : [];

		let index = 0;
		const groups = words.map((word, w) => ({
			key: `w${w}`,
			units:
				by === 'character'
					? Array.from(word).map((char, c) => ({ key: `w${w}c${c}`, text: char, index: index++ }))
					: [{ key: `w${w}`, text: word, index: index++ }]
		}));

		const total = index;
		const span = Math.max(0, maxDuration - DURATION);

		return {
			groups,
			step: total > 1 ? Math.min(stagger, span / (total - 1)) : 0
		};
	});

	const started = $derived(play && (!startOnView || inView));

	const observe: Attachment<HTMLElement> = (node) => {
		if (!startOnView) return;
		if (!('IntersectionObserver' in globalThis)) {
			inView = true;
			return;
		}

		const shouldDisconnectOnEnter = once;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (!entry) return;
				if (entry.isIntersecting) {
					inView = true;
					if (shouldDisconnectOnEnter) observer.disconnect();
				} else if (!shouldDisconnectOnEnter) {
					inView = false;
				}
			},
			{ threshold: amount }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};
</script>

<span
	{...restProps}
	{@attach observe}
	data-slot="text-reveal"
	class={cn('text-foreground', className)}
>
	<span class="sr-only">{text}</span>

	<span aria-hidden="true"
		>{#each split.groups as group, g (group.key)}{g > 0 ? ' ' : ''}<span
				class="inline-block align-baseline whitespace-nowrap"
				>{#each group.units as unit (unit.key)}<span
						class="inline-block align-baseline"
						{@attach motionTo(
							() => ({
								keyframes: started ? SHOWN : HIDDEN,
								transition: {
									duration: DURATION,
									ease: EASE,
									// Each unit waits its turn, so the line reads as a sweep.
									delay: started ? unit.index * split.step : 0
								}
							}),
							{ initial: true }
						)}>{unit.text}</span
					>{/each}</span
			>{/each}</span
	>
</span>
