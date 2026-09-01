<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The status labels trading places, and the stack settling under them. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const SPIN = { duration: 0.7, ease: 'linear', repeat: Infinity } as const;

	export type LoadMoreStatus = 'idle' | 'loading' | 'error' | 'end';

	export type LoadMoreLabels = Record<LoadMoreStatus, string>;

	export interface LoadMoreProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Fetches the next page. Resolve `false` to signal the end of the feed. */
		onLoad: () => boolean | void | PromiseLike<boolean | void>;
		/** Whether more pages exist. `false` renders the end state. */
		hasMore?: boolean;
		/** Load automatically when the sentinel enters the viewport. */
		auto?: boolean;
		/** The scroll container, when the feed lives in a pane rather than the document. */
		root?: Element | null;
		/** Margin around the root used by the IntersectionObserver, so loading starts early. */
		rootMargin?: string;
		/** Cap on consecutive automatic loads before a human has to press the button. */
		maxAutoLoads?: number;
		/** Per-status label overrides. */
		labels?: Partial<LoadMoreLabels>;
		/** Called when `onLoad` rejects. Automatic loading is blocked until a manual retry. */
		onError?: (cause: unknown) => void;
	}

	const DEFAULT_LABELS = {
		idle: 'Load more',
		loading: 'Loading',
		error: 'Couldn’t load. Try again',
		end: 'You’re all caught up'
	} satisfies LoadMoreLabels;

	const ORDER: LoadMoreStatus[] = ['idle', 'loading', 'error', 'end'];

	const TONE = {
		idle: 'text-foreground',
		loading: 'text-muted-foreground',
		error: 'text-destructive',
		end: 'text-muted-foreground'
	} satisfies Record<LoadMoreStatus, string>;

	let {
		class: className,
		onLoad,
		hasMore = true,
		auto = true,
		root = null,
		rootMargin = '600px 0px',
		maxAutoLoads = 3,
		labels,
		onError,
		...restProps
	}: LoadMoreProps = $props();

	let phase = $state<'idle' | 'loading' | 'error'>('idle');
	let ended = $state(false);

	let observer: IntersectionObserver | null = null;
	let observedEl: HTMLDivElement | null = null;
	let seq = 0;
	let busy = false;
	let alive = true;
	let runs = 0;
	let done = false;
	let blocked = false;

	const status: LoadMoreStatus = $derived(ended || !hasMore ? 'end' : phase);
	const text: LoadMoreLabels = $derived({ ...DEFAULT_LABELS, ...labels });
	const inert = $derived(status === 'loading' || status === 'end');

	onDestroy(() => {
		alive = false;
	});

	$effect(() => {
		if (hasMore) {
			done = false;
			ended = false;
		}
	});

	function reobserve() {
		if (observer && observedEl) {
			observer.unobserve(observedEl);
			observer.observe(observedEl);
		}
	}

	function run(manual: boolean) {
		if (busy || done || !hasMore) return;

		if (manual) {
			runs = 0;
			blocked = false;
		} else {
			if (blocked) return;
			if (runs >= maxAutoLoads) {
				return;
			}
			runs += 1;
		}

		busy = true;
		const id = ++seq;
		phase = 'loading';

		Promise.resolve()
			.then(() => onLoad())
			.then(
				(result) => {
					busy = false;
					if (!alive || id !== seq) return;
					phase = 'idle';
					if (result === false) {
						done = true;
						ended = true;
						return;
					}
					reobserve();
				},
				(cause: unknown) => {
					busy = false;
					if (!alive || id !== seq) return;
					blocked = true;
					onError?.(cause);
					phase = 'error';
				}
			);
	}

	// One sentinel, one page: the observer drops duplicate intersections while a
	// request is in flight, and the auto-load counter resets only when the
	// sentinel actually leaves the viewport.
	const sentinel: Attachment<HTMLDivElement> = (el) => {
		if (!auto || ended) return;

		const io = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (!entry) return;
				if (entry.isIntersecting) {
					run(false);
					return;
				}
				runs = 0;
			},
			{ root: root ?? null, rootMargin, threshold: 0 }
		);

		observer = io;
		observedEl = el;
		io.observe(el);

		return () => {
			io.disconnect();
			observer = null;
			observedEl = null;
		};
	};

	function handleClick(event: MouseEvent) {
		if (inert) {
			event.preventDefault();
			return;
		}
		run(true);
	}
</script>

{#snippet mark(s: LoadMoreStatus)}
	{#if s === 'idle'}
		<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true" class="shrink-0">
			<path
				d="M2.6 4.2 5.5 7.1 8.4 4.2"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{:else if s === 'loading'}
		<svg
			width="11"
			height="11"
			viewBox="0 0 11 11"
			fill="none"
			aria-hidden="true"
			class="shrink-0 origin-center"
			{@attach motionTo(
				() => ({
					keyframes: {
						rotate: status === 'loading' && !reducedMotion.current ? 360 : 0
					},
					transition: status === 'loading' && !reducedMotion.current ? SPIN : { duration: 0 }
				}),
				{ initial: true }
			)}
		>
			<circle cx="5.5" cy="5.5" r="3.9" stroke="currentColor" stroke-width="1.5" opacity="0.25" />
			<path
				d="M5.5 1.6a3.9 3.9 0 0 1 3.9 3.9"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		</svg>
	{:else if s === 'error'}
		<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true" class="shrink-0">
			<path d="M5.5 2.4v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
			<rect x="4.7" y="7.5" width="1.6" height="1.6" rx="0.4" fill="currentColor" />
		</svg>
	{:else}
		<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true" class="shrink-0">
			<path
				d="M2.2 5.7 4.5 8 8.8 3"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{/if}
{/snippet}

<div {...restProps} class={cn('relative flex w-full justify-center', className)}>
	<div
		{@attach sentinel}
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 top-0 h-px"
	></div>

	<button
		type="button"
		aria-busy={status === 'loading' || undefined}
		aria-disabled={inert || undefined}
		aria-label={text[status]}
		onclick={handleClick}
		style:touch-action="manipulation"
		class={cn(
			'group relative inline-flex h-8 items-center justify-center rounded-[9px] px-3 text-[12.5px] font-medium outline-none select-none',
			'transition-[background-color,box-shadow,transform] duration-150',
			'focus-visible:bg-primary/5 focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
			inert ? 'cursor-default' : 'hover:bg-foreground/5 cursor-pointer active:translate-y-px'
		)}
	>
		<span
			aria-hidden="true"
			class="relative grid place-items-center"
			{@attach motionTo(() => ({
				keyframes: { y: status === 'loading' ? 1 : 0 },
				transition: CROSSFADE
			}))}
		>
			{#each ORDER as s (s)}
				<span
					class={cn('col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap', TONE[s])}
					{@attach motionTo(() => ({
						keyframes:
							s === status
								? { opacity: 1, y: 0, filter: 'blur(0px)' }
								: { opacity: 0, y: 3, filter: 'blur(3px)' },
						transition: CROSSFADE
					}))}
				>
					{@render mark(s)}
					{text[s]}
				</span>
			{/each}
		</span>
	</button>

	<span role="status" aria-live="polite" aria-atomic="true" class="sr-only">
		{status === 'error' || status === 'end' ? text[status] : ''}
	</span>
</div>
