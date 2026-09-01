<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition } from '$lib/motion.js';

	/** The step tiles and the rail between them. */
	const RAIL = { type: 'spring', stiffness: 520, damping: 40, mass: 0.5 } as const;
	/** Titles, panels and the advance button trading places. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];
	const STILL = { duration: 0 } as const;

	export type WizardDirection = 1 | -1;

	export interface WizardStep {
		/** Stable id — it keys the panel across a transition. */
		id: string;
		label: string;
		/** Plain text body. For rich panels pass the `step` snippet instead. */
		content?: string;
	}

	export interface WizardStepsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Ordered steps, each { id, label, content? }. */
		steps: WizardStep[];
		/** Current step. Bindable; direction is still derived from the previous value. */
		index?: number;
		/** Uncontrolled starting step, clamped into range. */
		defaultIndex?: number;
		/** Fires with the step and the direction of travel, never on a no-op move. */
		onIndexChange?: (index: number, direction: WizardDirection) => void;
		/** Fires when the primary button is pressed on the last step. */
		onComplete?: () => void;
		/** Swaps the panel for the completion note and retires the primary button. */
		complete?: boolean;
		/** Fixed height of the panel viewport in px. Taller content scrolls inside it. */
		height?: number;
		backLabel?: string;
		nextLabel?: string;
		/** Primary label on the last step. Shares a grid cell with nextLabel, so nothing resizes. */
		finishLabel?: string;
		completeLabel?: string;
		completeHint?: string;
		/** Accessible name for the step marker list. */
		label?: string;
		/** Rich panel body, rendered instead of `step.content`. */
		step?: Snippet<[WizardStep, number]>;
	}

	type Intent = 'list' | 'panel' | null;

	function clampIndex(value: number, total: number) {
		if (total < 1) return 0;
		return Math.max(0, Math.min(total - 1, Math.trunc(value)));
	}

	let {
		class: className,
		steps,
		defaultIndex = 0,
		index = $bindable(defaultIndex),
		onIndexChange,
		onComplete,
		complete = false,
		height = 184,
		backLabel = 'Back',
		nextLabel = 'Next',
		finishLabel = 'Finish',
		completeLabel = 'All set',
		completeHint = 'Step back to change anything',
		label = 'Steps',
		step,
		...restProps
	}: WizardStepsProps = $props();

	const total = $derived(steps.length);
	const at = $derived(clampIndex(index ?? 0, total));
	const current = $derived(steps[at]);
	const isFirst = $derived(at === 0);
	const isLast = $derived(at === total - 1);
	const position = $derived(`Step ${at + 1} of ${total}: ${current?.label ?? ''}`);

	let seen = untrack(() => clampIndex(index ?? defaultIndex, steps.length));
	let direction = $state<WizardDirection>(1);
	let furthest = $state(seen);

	$effect.pre(() => {
		const target = at;
		if (target !== seen) {
			direction = target > seen ? 1 : -1;
			seen = target;
		}
		if (target > furthest) furthest = target;
	});

	let listEl: HTMLOListElement | undefined = $state();
	let viewportEl: HTMLDivElement | undefined = $state();
	let intent: Intent = null;

	$effect(() => {
		void at;
		const move = intent;
		intent = null;
		if (move === 'list') {
			listEl?.querySelector<HTMLButtonElement>('button[data-current="true"]')?.focus();
			return;
		}
		if (move === 'panel') viewportEl?.focus({ preventScroll: true });
	});

	function goTo(to: number, kind: Intent = null) {
		const target = clampIndex(to, total);
		if (target === at) return;
		const way: WizardDirection = target > at ? 1 : -1;
		intent = kind;
		direction = way;
		index = target;
		onIndexChange?.(target, way);
	}

	function advance() {
		if (at >= total - 1) {
			onComplete?.();
			return;
		}
		goTo(at + 1, 'panel');
	}

	function onStepKeyDown(event: KeyboardEvent) {
		let target: number;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = at + 1;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = at - 1;
		else if (event.key === 'Home') target = 0;
		else if (event.key === 'End') target = furthest;
		else return;

		event.preventDefault();
		target = Math.min(clampIndex(target, total), furthest);
		if (target === at) return;
		goTo(target, 'list');
	}

	const panelKey = $derived(complete ? '__complete' : (current?.id ?? '__empty'));
	const sizerLabel = $derived(finishLabel.length > nextLabel.length ? finishLabel : nextLabel);
</script>

<div {...restProps} data-slot="wizard-steps" class={cn('w-full', className)}>
	<p aria-live="polite" class="sr-only">{position}</p>

	<span aria-hidden="true" class="text-foreground/80 mb-2 grid text-[13px] font-medium select-none">
		{#each steps as entry, i (entry.id)}
			<span
				class="col-start-1 row-start-1 truncate"
				{@attach motionTo(() => ({
					keyframes: { opacity: i === at ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				{entry.label}
			</span>
		{/each}
	</span>

	<ol bind:this={listEl} aria-label={label} class="mb-4 flex list-none items-center gap-1 p-0">
		{#each steps as entry, i (entry.id)}
			{@const done = complete || i < at}
			{@const here = !complete && i === at}
			{@const name = `Step ${i + 1} of ${total}: ${entry.label}`}

			<li class="flex flex-1 items-center gap-1 last:flex-none">
				{#snippet tile(marked: boolean, active: boolean)}
					<span
						aria-hidden="true"
						class={cn(
							'wizard-tile grid size-7 place-items-center rounded-[8px] border text-[11.5px] font-medium tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)]',
							marked
								? 'border-primary bg-primary text-primary-foreground'
								: active
									? 'border-border bg-card text-foreground'
									: 'border-border bg-card text-muted-foreground'
						)}
						{@attach motionTo(() => ({
							keyframes: { scale: active ? 1 : 0.92 },
							transition: RAIL
						}))}
					>
						{#if marked}
							<svg width="12" height="12" viewBox="0 0 256 256" fill="none" aria-hidden="true">
								<polyline
									points="216 72 104 184 48 128"
									stroke="currentColor"
									stroke-width="24"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							{i + 1}
						{/if}
					</span>
				{/snippet}

				{#if i <= furthest}
					<button
						type="button"
						data-current={here ? 'true' : undefined}
						tabindex={here ? 0 : -1}
						aria-current={here ? 'step' : undefined}
						aria-label={name}
						onkeydown={onStepKeyDown}
						onclick={() => {
							if (here) return;
							goTo(i, 'list');
						}}
						class="rounded-[8px] outline-none focus-visible:shadow-[0_0_0_1.5px_var(--color-ring)]"
					>
						{@render tile(done, here)}
					</button>
				{:else}
					<span>
						<span class="sr-only">{name}</span>
						{@render tile(done, here)}
					</span>
				{/if}

				{#if i < total - 1}
					<span
						aria-hidden="true"
						class="bg-muted relative h-[3px] flex-1 overflow-hidden rounded-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)]"
					>
						<span
							class="bg-primary absolute inset-0 origin-left rounded-[2px]"
							{@attach motionTo(() => ({
								keyframes: { scaleX: complete || i < at ? 1 : 0 },
								transition: RAIL
							}))}
						></span>
					</span>
				{/if}
			</li>
		{/each}
	</ol>

	<div
		bind:this={viewportEl}
		tabindex="-1"
		role="group"
		aria-label={position}
		style:height={`${height}px`}
		class="border-border bg-card focus-visible:border-ring relative overflow-hidden rounded-[11px] border shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-8px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-150 outline-none"
	>
		{#key panelKey}
			<div
				in:motionTransition={{
					keyframes: { opacity: [0, 1], x: [direction * 22, 0] },
					transition: CROSSFADE,
					reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
				}}
				out:motionTransition={{
					keyframes: { opacity: 0, x: direction * -22 },
					transition: CROSSFADE,
					reduced: { keyframes: { opacity: 0 }, transition: STILL }
				}}
				class="text-foreground/80 absolute inset-0 overflow-y-auto overscroll-contain p-4 text-[13.5px] leading-relaxed [scrollbar-gutter:stable]"
			>
				{#if complete}
					<div class="flex h-full flex-col items-center justify-center gap-1.5">
						<p class="text-foreground text-[13px] font-medium">{completeLabel}</p>
						<p class="text-muted-foreground text-[12.5px]">{completeHint}</p>
					</div>
				{:else if current}
					{#if step}
						{@render step(current, at)}
					{:else}
						{current.content ?? ''}
					{/if}
				{/if}
			</div>
		{/key}
	</div>

	<div class="mt-3 flex h-9 items-center gap-3">
		{#if !isFirst}
			<button
				type="button"
				in:motionTransition={{
					keyframes: { opacity: [0, 1] },
					transition: { duration: 0.16, ease: EASE }
				}}
				out:motionTransition={{
					keyframes: { opacity: 0 },
					transition: { duration: 0.12, ease: EXIT_EASE }
				}}
				onclick={() => goTo(at - 1, 'panel')}
				class="border-border bg-card text-foreground/80 hover:border-foreground/20 focus-visible:border-ring h-9 rounded-[9px] border px-3 text-[13px] font-medium transition-[border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
			>
				{backLabel}
			</button>
		{/if}

		{#if !complete}
			<button
				type="button"
				aria-label={isLast ? finishLabel : nextLabel}
				onclick={advance}
				in:motionTransition={{
					keyframes: { opacity: [0, 1], scale: [0.96, 1] },
					transition: CROSSFADE
				}}
				out:motionTransition={{
					keyframes: { opacity: 0, scale: 0.96 },
					transition: { duration: 0.14, ease: EXIT_EASE }
				}}
				class="bg-primary text-primary-foreground ml-auto grid h-9 place-items-center rounded-[9px] px-3.5 text-[13px] font-medium outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-ring)]"
			>
				<span aria-hidden="true" class="invisible col-start-1 row-start-1">{sizerLabel}</span>
				<span
					aria-hidden="true"
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({
						keyframes: { opacity: isLast ? 0 : 1 },
						transition: CROSSFADE
					}))}
				>
					{nextLabel}
				</span>
				<span
					aria-hidden="true"
					class="col-start-1 row-start-1"
					{@attach motionTo(() => ({
						keyframes: { opacity: isLast ? 1 : 0 },
						transition: CROSSFADE
					}))}
				>
					{finishLabel}
				</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.wizard-tile {
		transition:
			transform 260ms cubic-bezier(0.3, 1.1, 0.4, 1),
			background-color 150ms ease-out,
			border-color 150ms ease-out,
			color 150ms ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.wizard-tile {
			transition: none;
		}
	}
</style>
