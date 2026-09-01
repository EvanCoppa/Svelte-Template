<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionEnter, motionTo } from '$lib/motion.js';

	/** The bar filling to a known fraction. */
	const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
	/** The readout swapping between a percentage and a pending note. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The measured amount. `null` means the total is not known yet and the bar runs its indeterminate sweep. */
		value: number | null;
		/** Upper bound for `value`. Also the reported `aria-valuemax`. */
		max?: number;
		/** Names the bar for sighted users and, through `aria-labelledby`, for screen readers. */
		label?: string;
		/** Readout shown while `value` is `null`, in the same grid cell as the percentage. */
		pendingLabel?: string;
		/** Announced once through a polite live region when the bar fills. */
		completeLabel?: string;
	}

	let {
		class: className,
		value,
		max = 100,
		label = 'Progress',
		pendingLabel = 'Working',
		completeLabel = 'Complete',
		...restProps
	}: ProgressBarProps = $props();

	const labelId = $props.id();

	const indeterminate = $derived(value === null);
	const fraction = $derived(value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max)));
	const percent = $derived(Math.round(fraction * 100));
	const complete = $derived(!indeterminate && fraction >= 1);
	const valueNow = $derived(Math.round(fraction * max * 100) / 100);
</script>

<div {...restProps} class={cn('w-full', className)}>
	<div class="flex items-baseline justify-between gap-3">
		<span id={labelId} class="text-foreground truncate text-[13px] font-medium">
			{label}
		</span>

		<span aria-hidden="true" class="text-muted-foreground grid shrink-0 justify-items-end">
			<span
				class="col-start-1 row-start-1 text-[12px] leading-5 font-medium whitespace-nowrap"
				{@attach motionTo(() => ({
					keyframes: { opacity: indeterminate ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				{pendingLabel}
			</span>

			<span
				class="col-start-1 row-start-1 font-mono text-[12px] leading-5 font-medium whitespace-nowrap tabular-nums"
				{@attach motionTo(() => ({
					keyframes: { opacity: indeterminate ? 0 : 1 },
					transition: CROSSFADE
				}))}
			>
				{percent}%
			</span>
		</span>
	</div>

	<div
		role="progressbar"
		aria-labelledby={labelId}
		aria-valuemin={0}
		aria-valuemax={max}
		aria-valuenow={indeterminate ? undefined : valueNow}
		aria-valuetext={indeterminate ? undefined : `${percent}%`}
		class="bg-muted mt-2 rounded-[4px] p-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
	>
		<div class="relative h-[8px] overflow-hidden rounded-[2px]">
			<span
				aria-hidden="true"
				class="bg-primary absolute inset-0 block origin-left rounded-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.2)]"
				{@attach motionTo(() => ({
					keyframes: { scaleX: indeterminate ? 0 : fraction },
					transition: FILL
				}))}
			></span>

			{#if indeterminate}
				<span
					aria-hidden="true"
					class="bg-primary absolute inset-y-0 left-0 block w-2/5 rounded-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.2)]"
					{@attach motionEnter(
						{ x: ['-100%', '250%'], opacity: [0, 1] },
						{
							x: { duration: 1.25, ease: 'easeInOut', repeat: Infinity },
							opacity: { duration: 0.18 }
						}
					)}
				></span>
			{/if}
		</div>
	</div>

	<span aria-live="polite" class="sr-only">
		{complete ? completeLabel : indeterminate ? pendingLabel : ''}
	</span>
</div>
