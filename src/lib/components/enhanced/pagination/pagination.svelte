<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTransition, reducedMotion } from '$lib/motion.js';

	export type PaginationItem = number | 'gap-l' | 'gap-r';

	export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
		/** Total number of pages. Slot geometry comes from its digit count, so the row never resizes. */
		count: number;
		/** Current page, 1-based. Bindable; omit it and the nav keeps its own. */
		page?: number;
		/** Uncontrolled starting page, clamped into range. */
		defaultPage?: number;
		/** Pages shown on each side of the current page once the window is sliding. */
		siblings?: number;
		/** Pages pinned at each end of the row no matter where the window is. */
		boundaries?: number;
		/** Fires with the next page on every move, bound or not. */
		onPageChange?: (page: number) => void;
		/** Accessible name for the nav landmark. */
		label?: string;
	}

	/** Framer's `{ stiffness: 520, damping: 34, mass: 0.45 }` from the original. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	const GAP = 4;
	/** A number rolling in from the direction the page moved. */
	// SAFETY: this literal is a fixed 4-item cubic-bezier tuple; the assertion just names
	// the shape the `ease` option's type expects.
	const ROLL = { duration: 0.18, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] };

	const range = (from: number, to: number) =>
		Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

	function paginate(
		page: number,
		count: number,
		siblings: number,
		boundaries: number
	): PaginationItem[] {
		const total = 2 * boundaries + 2 * siblings + 3;
		if (count <= total) return range(1, count);

		const nearStart = page < boundaries + siblings + 2;
		const nearEnd = page > count - boundaries - siblings - 1;

		if (nearStart) {
			return [
				...range(1, 2 * siblings + boundaries + 2),
				'gap-r',
				...range(count - boundaries + 1, count)
			];
		}
		if (nearEnd) {
			return [
				...range(1, boundaries),
				'gap-l',
				...range(count - 2 * siblings - boundaries - 1, count)
			];
		}
		return [
			...range(1, boundaries),
			'gap-l',
			...range(page - siblings, page + siblings),
			'gap-r',
			...range(count - boundaries + 1, count)
		];
	}

	let {
		class: className,
		count,
		defaultPage = 1,
		page = $bindable(defaultPage),
		siblings = 1,
		boundaries = 1,
		onPageChange,
		label = 'Pagination',
		...restProps
	}: PaginationProps = $props();

	const clampTo = (value: number) => Math.min(Math.max(1, value), Math.max(1, count));

	const current = $derived(clampTo(page ?? 1));
	const items = $derived(paginate(current, count, siblings, boundaries));
	const thumbIndex = $derived(items.indexOf(current));
	const canPrev = $derived(current > 1);
	const canNext = $derived(current < count);

	const digits = $derived(String(Math.max(1, count)).length);
	const slot = $derived(Math.max(32, 18 + digits * 8));

	let seen = untrack(() => clampTo(page ?? defaultPage));
	let direction = $state(1);

	$effect.pre(() => {
		if (current !== seen) {
			direction = current > seen ? 1 : -1;
			seen = current;
		}
	});

	function goTo(value: number) {
		const next = clampTo(value);
		if (next === current) return;
		page = next;
		onPageChange?.(next);
	}

	let thumbEl: HTMLSpanElement | undefined = $state();
	let placed = false;

	$effect(() => {
		const node = thumbEl;
		const offset = thumbIndex < 0 ? 0 : thumbIndex * (slot + GAP);
		if (!node) return;

		const still = !placed || reducedMotion.current;
		placed = true;

		const controls = animate(node, { x: offset }, still ? { duration: 0 } : CELL);
		return () => controls.stop();
	});

	let spoken = $state('');

	$effect(() => {
		const message = `Page ${current} of ${Math.max(1, count)}`;
		const timer = setTimeout(() => (spoken = message), 500);
		return () => clearTimeout(timer);
	});

	const arrowClass =
		'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] outline-none transition-colors duration-150 focus-visible:bg-primary/5 focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]';
</script>

<nav {...restProps} aria-label={label} data-slot="pagination" class={cn('inline-block', className)}>
	<div class="flex items-center" style:gap={`${GAP}px`}>
		<button
			type="button"
			aria-label="Previous page"
			aria-disabled={!canPrev}
			onclick={() => canPrev && goTo(current - 1)}
			class={cn(
				arrowClass,
				canPrev
					? 'text-muted-foreground hover:bg-muted hover:text-foreground'
					: 'text-muted-foreground/40'
			)}
		>
			<svg
				viewBox="0 0 12 12"
				width="12"
				height="12"
				aria-hidden="true"
				focusable="false"
				class="-scale-x-100"
			>
				<path
					d="M4.75 2.75 8 6l-3.25 3.25"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>

		<div class="relative">
			<span
				bind:this={thumbEl}
				aria-hidden="true"
				class="bg-primary absolute inset-y-0 left-0 rounded-[9px]"
				style:width={`${slot}px`}
				style:opacity={thumbIndex < 0 ? 0 : 1}
			></span>

			<ol class="relative flex" style:gap={`${GAP}px`}>
				{#each items as item (typeof item === 'number' ? `slot-${item}` : item)}
					{#if typeof item === 'number'}
						{@const selected = item === current}
						<li style:width={`${slot}px`}>
							<button
								type="button"
								aria-label={`Page ${item}`}
								aria-current={selected ? 'page' : undefined}
								onclick={() => goTo(item)}
								class={cn(
									'focus-visible:bg-primary/5 flex h-8 w-full items-center justify-center rounded-[9px] text-[12.5px] tabular-nums transition-colors duration-150 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]',
									selected
										? 'text-primary-foreground font-medium'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
							>
								<span
									in:motionTransition={{
										keyframes: { opacity: [0, 1], x: [8 * direction, 0] },
										transition: ROLL
									}}
								>
									{item}
								</span>
							</button>
						</li>
					{:else}
						<li
							aria-hidden="true"
							style:width={`${slot}px`}
							class="text-muted-foreground flex h-8 items-center justify-center text-[12.5px]"
						>
							&hellip;
						</li>
					{/if}
				{/each}
			</ol>
		</div>

		<button
			type="button"
			aria-label="Next page"
			aria-disabled={!canNext}
			onclick={() => canNext && goTo(current + 1)}
			class={cn(
				arrowClass,
				canNext
					? 'text-muted-foreground hover:bg-muted hover:text-foreground'
					: 'text-muted-foreground/40'
			)}
		>
			<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
				<path
					d="M4.75 2.75 8 6l-3.25 3.25"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>

	<span role="status" class="sr-only">{spoken}</span>
</nav>
