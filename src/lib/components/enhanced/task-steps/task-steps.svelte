<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionEnter, motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	/** A status glyph landing. Under-damped, so it overshoots into place. */
	const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
	/** The running spinner appearing. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	const STILL = { duration: 0 } as const;

	export type TaskStep = {
		id: string;
		label: string;
		/** Right-aligned mono aside — a duration, a count — revealed when its step completes. */
		meta?: string;
	};

	export type TaskStepStatus = 'pending' | 'active' | 'done' | 'error';

	export interface TaskStepsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The plan, in order. */
		steps: TaskStep[];
		/** Index of the step running now. Everything before it is done; at steps.length the run is complete. */
		current: number;
		/** The run stopped at `current`. The active row becomes the failure. */
		failed?: boolean;
		/** Accessible name for the list. */
		label?: string;
	}

	let {
		class: className,
		steps,
		current,
		failed = false,
		label = 'Task progress',
		...restProps
	}: TaskStepsProps = $props();

	let spoken = $state('');

	const complete = $derived(!failed && current >= steps.length);

	const rows = $derived(
		steps.map((step, i) => ({
			...step,
			// SAFETY: the ternary above only ever produces one of TaskStepStatus's
			// four literal members, so the annotation just names what it already is.
			status: (i < current
				? 'done'
				: i === current && failed
					? 'error'
					: i === current && !complete
						? 'active'
						: 'pending') as TaskStepStatus
		}))
	);

	const active = $derived(rows.find((r) => r.status === 'active'));

	const sentence = $derived(
		failed
			? `Failed at ${steps[Math.min(current, steps.length - 1)]?.label ?? 'step'}`
			: complete
				? `All ${steps.length} steps complete`
				: active
					? `${active.label}, step ${current + 1} of ${steps.length}`
					: ''
	);

	// One settled sentence per stage, after a half-second hold, so a run that
	// hops through three stages in a second is one announcement, not three.
	$effect(() => {
		if (!sentence) return;
		const t = setTimeout(() => {
			spoken = sentence;
		}, 500);
		return () => clearTimeout(t);
	});

	const TONE = {
		done: 'text-foreground/70',
		active: 'font-medium text-foreground',
		error: 'font-medium text-destructive',
		pending: 'text-muted-foreground/60'
	} satisfies Record<TaskStepStatus, string>;
</script>

<div {...restProps} class={cn('w-full', className)}>
	<ol aria-label={label} class="space-y-0.5">
		{#each rows as row (row.id)}
			<li
				aria-current={row.status === 'active' ? 'step' : undefined}
				class="flex h-7 items-center gap-2.5 px-1"
			>
				<span class="relative grid size-4 shrink-0 place-items-center">
					{#if row.status === 'done'}
						<span
							class="col-start-1 row-start-1 grid size-4 place-items-center rounded-[5px] bg-emerald-500/[0.14] text-emerald-600 dark:bg-emerald-400/[0.16] dark:text-emerald-400"
							in:motionTransition={{
								keyframes: { opacity: [0, 1], scale: [0.4, 1] },
								transition: POP,
								reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
							}}
						>
							<svg viewBox="0 0 256 256" width="11" height="11" fill="none" aria-hidden="true">
								<polyline
									points="216 72 104 184 48 128"
									stroke="currentColor"
									stroke-width="26"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
					{:else if row.status === 'error'}
						<span
							class="bg-destructive/[0.12] text-destructive col-start-1 row-start-1 grid size-4 place-items-center rounded-[5px]"
							in:motionTransition={{
								keyframes: { opacity: [0, 1], scale: [0.4, 1] },
								transition: POP,
								reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
							}}
						>
							<svg viewBox="0 0 256 256" width="10" height="10" fill="none" aria-hidden="true">
								<path
									d="M200 56 56 200 M56 56l144 144"
									stroke="currentColor"
									stroke-width="26"
									stroke-linecap="round"
								/>
							</svg>
						</span>
					{:else if row.status === 'active'}
						<span
							class="text-muted-foreground col-start-1 row-start-1"
							in:motionTransition={{ keyframes: { opacity: [0, 1] }, transition: CELL }}
						>
							<svg
								viewBox="0 0 16 16"
								class="size-3 origin-center"
								{@attach motionTo(
									() => ({
										keyframes: { rotate: reducedMotion.current ? 0 : 360 },
										transition: reducedMotion.current
											? STILL
											: { duration: 0.8, ease: 'linear', repeat: Infinity }
									}),
									{ initial: true }
								)}
								aria-hidden="true"
							>
								<circle
									cx="8"
									cy="8"
									r="6"
									fill="none"
									stroke="currentColor"
									stroke-opacity="0.25"
									stroke-width="2"
								/>
								<path
									d="M8 2 a6 6 0 0 1 6 6"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</span>
					{:else}
						<span class="bg-muted-foreground/30 col-start-1 row-start-1 size-[5px] rounded-[2px]"
						></span>
					{/if}
				</span>

				{#if row.status === 'active' && !reducedMotion.current}
					<span
						class="task-shimmer min-w-0 flex-1 truncate text-[12.5px] font-medium"
						{@attach motionEnter(
							{ backgroundPosition: ['120% 0', '-120% 0'] },
							{ duration: 1.6, ease: 'linear', repeat: Infinity }
						)}
					>
						{row.label}
					</span>
				{:else}
					<span
						class={cn(
							'min-w-0 flex-1 truncate text-[12.5px] transition-colors duration-200',
							TONE[row.status]
						)}
					>
						{row.label}
					</span>
				{/if}

				{#if row.meta}
					<span
						class={cn(
							'shrink-0 font-mono text-[10.5px] tabular-nums transition-opacity duration-200',
							row.status === 'done' ? 'text-muted-foreground opacity-100' : 'opacity-0'
						)}
						aria-hidden={row.status !== 'done'}
					>
						{row.meta}
					</span>
				{/if}
			</li>
		{/each}
	</ol>

	<span role="status" class="sr-only">{spoken}</span>
	<span class="sr-only" aria-live={complete || failed ? 'polite' : 'off'}>
		{complete ? 'Run complete' : failed ? 'Run failed' : ''}
	</span>
</div>

<style>
	.task-shimmer {
		background-image: linear-gradient(
			90deg,
			var(--muted-foreground) 38%,
			var(--foreground) 50%,
			var(--muted-foreground) 62%
		);
		background-size: 220% 100%;
		background-clip: text;
		-webkit-background-clip: text;
		color: transparent;
	}
</style>
