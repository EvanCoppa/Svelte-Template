<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTransition } from '$lib/motion.js';

	/** The real content and its placeholder trading places. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const STILL = { duration: 0 } as const;

	export interface SkeletonSwapProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Flips to true when the real content is available. */
		ready: boolean;
		/** The real content. Mount it only once the data exists; the component holds the box either way. */
		children?: Snippet;
		/** How many text lines the skeleton draws, and how much height it reserves. */
		lines?: number;
		/** Pixel line height of the content this stands in for. */
		lineHeight?: number;
		/** Height of the bar drawn inside each reserved line. Purely visual. */
		barHeight?: number;
		/** Explicit box height in pixels, for content that is not text. */
		reserve?: number;
		/** Milliseconds of silence before the skeleton is allowed to paint. */
		delay?: number;
		/** Once painted, the skeleton stays at least this long, so it cannot blink. */
		minVisible?: number;
		/** Names the region and announces "<label> loaded" once. */
		label?: string;
		/** Replaces the default bars with a custom placeholder shape. */
		skeleton?: Snippet;
	}

	const WIDTHS = [100, 93, 97, 88, 95, 91] as const;

	function widthFor(index: number, total: number) {
		if (total > 1 && index === total - 1) return 62;
		return WIDTHS[(index * 7 + 3) % WIDTHS.length];
	}

	let {
		class: className,
		ready,
		children,
		lines = 3,
		lineHeight = 21,
		barHeight = 9,
		reserve,
		delay = 120,
		minVisible = 380,
		label,
		skeleton,
		...restProps
	}: SkeletonSwapProps = $props();

	let visible = $state(false);
	let scrollable = $state(false);
	let shownAt = 0;

	const box = $derived(reserve ?? lines * lineHeight);

	// Show only after `delay` of waiting; once shown, keep for at least `minVisible`.
	$effect(() => {
		if (!ready) {
			if (visible) return;
			const t = setTimeout(() => {
				shownAt = performance.now();
				visible = true;
			}, delay);
			return () => clearTimeout(t);
		}

		if (!visible) return;
		const rest = Math.max(0, minVisible - (performance.now() - shownAt));
		const t = setTimeout(() => {
			visible = false;
		}, rest);
		return () => clearTimeout(t);
	});

	// The box takes a tab stop only while it is actually scrollable.
	const watchScrollable: Attachment<HTMLDivElement> = (el) => {
		const check = () => {
			scrollable = el.scrollHeight - el.clientHeight > 1;
		};
		check();

		const ro = new ResizeObserver(check);
		ro.observe(el);
		const inner = el.firstElementChild;
		if (inner) ro.observe(inner);
		return () => ro.disconnect();
	};

	function skeletonIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1] },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: 1 }, transition: STILL }
		});
	}

	function skeletonOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, filter: 'blur(3px)' },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	{...restProps}
	{@attach watchScrollable}
	aria-busy={!ready}
	aria-label={label}
	role={scrollable ? 'region' : undefined}
	tabindex={scrollable ? 0 : undefined}
	style:height={`${box}px`}
	class={cn('text-foreground relative grid overflow-y-auto overscroll-contain', className)}
>
	<div
		class={cn(
			'swap-content col-start-1 row-start-1 min-w-0',
			visible && 'swap-content-hidden pointer-events-none'
		)}
	>
		{@render children?.()}
	</div>

	{#if visible}
		<div
			aria-hidden="true"
			class="pointer-events-none col-start-1 row-start-1 w-full self-start"
			in:skeletonIn
			out:skeletonOut
		>
			{#if skeleton}
				{@render skeleton()}
			{:else}
				<div class="w-full">
					{#each Array.from({ length: lines }, (_, i) => i) as i (i)}
						<div class="flex items-center" style:height={`${lineHeight}px`}>
							<div
								class="bg-muted-foreground/25 rounded-[5px]"
								style:height={`${barHeight}px`}
								style:width={`${widthFor(i, lines)}%`}
							></div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if label}
		<span role="status" class="sr-only">{ready ? `${label} loaded` : ''}</span>
	{/if}
</div>
