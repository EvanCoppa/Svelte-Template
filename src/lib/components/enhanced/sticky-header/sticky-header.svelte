<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { motionValue, springValue } from 'motion';
	import { cn } from '$lib/utils.js';
	import { reducedMotion } from '$lib/motion.js';

	/** The spring the header rides, so it keeps moving after the scroll stops. */
	const SMOOTH = { stiffness: 240, damping: 44, mass: 0.6 } as const;

	export interface StickyHeaderProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'title'
	> {
		title: string;
		children?: Snippet;
		subtitle?: string;
		leading?: Snippet;
		actions?: Snippet;
		expandedHeight?: number;
		compactHeight?: number;
		maxHeight?: number;
	}

	let {
		class: className,
		title,
		children,
		subtitle,
		leading,
		actions,
		expandedHeight = 68,
		compactHeight = 48,
		maxHeight = 320,
		...restProps
	}: StickyHeaderProps = $props();

	const tall = $derived(Math.max(expandedHeight, compactHeight));
	const short = $derived(Math.min(expandedHeight, compactHeight));
	const travel = $derived(Math.max(1, tall - short));
	const range = $derived(Math.max(64, travel * 3));

	// The raw scroll position, and the same value with a spring hung off it. The
	// header reads the sprung one, so it keeps travelling for a beat after the
	// scroll itself has stopped.
	const tracked = motionValue(0);
	const smooth = springValue(tracked, SMOOTH);

	let progress = $state(0);
	let condensed = $state(false);

	$effect(() => {
		const source = reducedMotion.current ? tracked : smooth;
		progress = source.get();
		return source.on('change', (value) => {
			progress = value;
		});
	});

	function handleScroll(event: Event) {
		// SAFETY: handleScroll is only ever bound as this component's own
		// onscroll handler on the scrollable div below, so currentTarget is that div.
		const el = event.currentTarget as HTMLDivElement;
		const p = Math.min(1, Math.max(0, el.scrollTop / range));
		tracked.set(p);
		condensed = p >= 1;
	}

	const plate = $derived((tall - travel * progress) / tall);
	const edge = $derived(tall - travel * progress);
	const lifted = $derived(Math.min(1, Math.max(0, progress / 0.12)));

	const bigY = $derived(-travel * progress);
	const bigOpacity = $derived(1 - Math.min(1, Math.max(0, progress / 0.45)));
	const bigScale = $derived(1 - 0.05 * progress);

	const smallOpacity = $derived(Math.min(1, Math.max(0, (progress - 0.55) / 0.35)));
	const smallY = $derived((1 - smallOpacity) * 6);
</script>

<div
	{...restProps}
	class={cn(
		'border-border bg-card relative overflow-hidden rounded-[14px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
		className
	)}
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		tabindex="0"
		role="region"
		aria-label={title}
		style:max-height="{maxHeight}px"
		style:scroll-padding-top="{short + 10}px"
		class="focus-visible:bg-primary/5 focus-visible:ring-ring overflow-y-auto overscroll-y-contain outline-none [scrollbar-gutter:stable] focus-visible:ring-1 focus-visible:ring-inset"
		onscroll={handleScroll}
	>
		<div aria-hidden="true" style:height="{tall}px"></div>
		{@render children?.()}

		<div
			aria-hidden="true"
			class="from-card pointer-events-none sticky bottom-0 -mt-6 h-6 bg-gradient-to-t to-transparent"
		></div>
	</div>
	<header
		data-condensed={condensed ? 'true' : 'false'}
		style:height="{tall}px"
		class="pointer-events-none absolute inset-x-0 top-0"
	>
		<div
			aria-hidden="true"
			style:height="{tall}px"
			style:transform="scaleY({plate})"
			class="bg-card absolute inset-x-0 top-0 origin-top"
		></div>
		<div
			aria-hidden="true"
			style:transform="translateY({edge}px)"
			style:opacity={lifted}
			class="absolute inset-x-0 top-0 h-px shadow-[0_6px_16px_-10px_rgba(0,0,0,0.45)]"
		></div>
		<div
			aria-hidden="true"
			style:transform="translateY({edge}px)"
			style:opacity={lifted}
			class="from-card absolute inset-x-0 top-0 h-5 bg-gradient-to-b to-transparent"
		></div>
		<div
			aria-hidden="true"
			style:transform="translateY({edge}px)"
			style:opacity={lifted}
			class="bg-border absolute inset-x-0 top-0 h-px"
		></div>
		<div class="absolute inset-x-0 top-0 flex items-start gap-2.5 px-4 pt-3">
			{#if leading}
				<div class="pointer-events-auto flex h-6 shrink-0 items-center">
					{@render leading()}
				</div>
			{/if}

			<div class="relative min-w-0 flex-1">
				<div
					style:transform="translateY({bigY}px) scale({bigScale})"
					style:opacity={bigOpacity}
					style:transform-origin="left top"
				>
					<h2
						class="text-foreground truncate text-[20px] leading-[1.2] font-medium tracking-[-0.03em]"
					>
						{title}
					</h2>
					{#if subtitle}
						<p class="text-muted-foreground mt-0.5 truncate text-[11.5px] leading-[1.35]">
							{subtitle}
						</p>
					{/if}
				</div>
				<span
					aria-hidden="true"
					style:opacity={smallOpacity}
					style:transform="translateY({smallY}px)"
					class="text-foreground absolute inset-x-0 top-[3px] truncate text-[13px] leading-[1.4] font-medium"
				>
					{title}
				</span>
			</div>

			{#if actions}
				<div class="pointer-events-auto flex h-6 shrink-0 items-center gap-1.5">
					{@render actions()}
				</div>
			{/if}
		</div>
	</header>
</div>
