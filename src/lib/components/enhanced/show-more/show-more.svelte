<script lang="ts">
	import { animate } from 'motion';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The veil, the two labels and the chevron. */
	const SMALL = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;

	export interface ShowMoreProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		children?: Snippet;
		/** Number of text lines visible while collapsed. */
		lines?: number;
		/** Expanded content taller than this scrolls instead of growing without bound. */
		maxHeight?: number;
		defaultExpanded?: boolean;
		/** Bindable expanded state. */
		expanded?: boolean;
		onExpandedChange?: (expanded: boolean) => void;
		moreLabel?: string;
		lessLabel?: string;
		/** Accessible name for the scrollable region when the content overflows. */
		label?: string;
	}

	let {
		class: className,
		children,
		moreLabel = 'Show more',
		lessLabel = 'Show less',
		label = 'Details',
		lines = 3,
		maxHeight = 320,
		defaultExpanded = false,
		expanded = $bindable(undefined),
		onExpandedChange,
		...restProps
	}: ShowMoreProps = $props();

	const regionId = $props.id();

	let uncontrolled = $state(defaultExpanded);
	let metrics = $state<{ line: number; full: number } | null>(null);
	let regionEl = $state<HTMLDivElement | null>(null);

	const isExpanded = $derived(expanded ?? uncontrolled);

	const clamped = $derived(metrics ? metrics.line * lines : 0);
	const expandable = $derived(metrics ? metrics.full - clamped > 1 : true);
	const capped = $derived(metrics ? metrics.full > maxHeight : false);
	const collapsedHeight = $derived(metrics ? Math.min(clamped, metrics.full) : null);
	const fullHeight = $derived(metrics ? Math.min(metrics.full, maxHeight) : null);
	const open = $derived(isExpanded && expandable);
	const height = $derived(open ? fullHeight : collapsedHeight);
	const scrollable = $derived(open && capped);
	const veiled = $derived(expandable && (!open || scrollable));

	function setExpanded(next: boolean) {
		if (expanded === undefined) uncontrolled = next;
		else expanded = next;
		onExpandedChange?.(next);
	}

	function press() {
		if (open) regionEl?.scrollTo({ top: 0 });
		setExpanded(!isExpanded);
	}

	// The collapsed state is a measured pixel height, never line-clamp, so the
	// paragraph breaks in exactly the same places open or shut.
	const measure: Attachment<HTMLDivElement> = (el) => {
		let prev: { line: number; full: number } | null = null;

		const read = () => {
			const styles = getComputedStyle(el);
			const parsed = Number.parseFloat(styles.lineHeight);
			const line = Number.isFinite(parsed) ? parsed : Number.parseFloat(styles.fontSize) * 1.5;
			const full = el.scrollHeight;

			if (!prev || prev.line !== line || prev.full !== full) {
				prev = { line, full };
				metrics = prev;
			}
		};

		read();

		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	};

	// The animated height is a number, so a toggle interrupted mid-flight springs
	// from the height the box currently has instead of snapping to a fresh one.
	let controls: { stop: () => void } | undefined;
	let lastHeight: number | null = null;

	$effect(() => {
		const el = regionEl;
		const next = height;
		if (!el || next === null) return;

		if (lastHeight === null || reducedMotion.current) {
			controls?.stop();
			el.style.height = `${next}px`;
			lastHeight = next;
			return;
		}
		if (next === lastHeight) return;
		lastHeight = next;

		controls?.stop();
		controls = animate(
			el,
			{ height: `${next}px` },
			{
				type: 'spring',
				stiffness: 190,
				damping: 30,
				mass: 1
			}
		);

		return () => controls?.stop();
	});
</script>

<div
	{...restProps}
	data-slot="show-more"
	class={cn('text-foreground text-[13.5px] leading-relaxed', className)}
>
	<div class="relative">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={regionEl}
			id={regionId}
			role={scrollable ? 'region' : undefined}
			aria-label={scrollable ? label : undefined}
			tabindex={scrollable ? 0 : undefined}
			style:max-height={height === null ? `${lines}lh` : undefined}
			style:overflow-y={scrollable ? 'auto' : 'hidden'}
			style:scrollbar-gutter={capped ? 'stable' : undefined}
			class="focus-visible:bg-ring/10 overflow-hidden overscroll-contain rounded-[6px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]"
		>
			<div {@attach measure}>{@render children?.()}</div>
		</div>
		<div
			aria-hidden="true"
			class="from-card to-card/0 pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t"
			{@attach motionTo(() => ({ keyframes: { opacity: veiled ? 1 : 0 }, transition: SMALL }))}
		></div>
	</div>
	<div class="mt-2 flex h-8 items-center">
		<button
			type="button"
			onclick={press}
			aria-expanded={open}
			aria-controls={regionId}
			class={cn(
				'border-border bg-card text-foreground hover:border-foreground/20 focus-visible:border-ring inline-flex h-8 items-center gap-2 rounded-[9px] border px-2.5 text-[12.5px] font-medium transition-[border-color,box-shadow] duration-150 outline-none select-none focus-visible:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_10px_20px_-14px_var(--color-ring)]',
				expandable ? '' : 'pointer-events-none invisible'
			)}
		>
			<span class="grid text-left">
				<span
					aria-hidden={open}
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({ keyframes: { opacity: open ? 0 : 1 }, transition: SMALL }))}
					>{moreLabel}</span
				>
				<span
					aria-hidden={!open}
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({ keyframes: { opacity: open ? 1 : 0 }, transition: SMALL }))}
					>{lessLabel}</span
				>
			</span>
			<svg
				aria-hidden="true"
				width="12"
				height="12"
				viewBox="0 0 256 256"
				fill="none"
				class="text-muted-foreground"
				{@attach motionTo(() => ({ keyframes: { rotate: open ? 180 : 0 }, transition: SMALL }))}
			>
				<polyline
					points="208 96 128 176 48 96"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
</div>
