<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The thumb swelling under a grab. */
	const GRAB = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	/** The detent name fading in as the value lands on one. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export type SliderDetent = { value: number; label?: string };

	export interface SliderDetentsProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'onkeydown' | 'onpointerdown' | 'onpointermove' | 'onpointerup'
	> {
		/** Controlled value. Always one of the step grid or a detent, never a raw pointer float. Bindable. */
		value?: number;
		/** Fires only when the resolved value actually changes, so dragging across one step emits once. */
		onValueChange?: (value: number) => void;
		/** Lower bound. Reported as aria-valuemin. */
		min?: number;
		/** Upper bound. Reported as aria-valuemax. */
		max?: number;
		/** The free grid between detents. Arrow keys move by exactly this, ignoring capture. */
		step?: number;
		/** The values worth stopping on. A bare number draws a mark; { value, label } also names it. */
		detents?: readonly (number | SliderDetent)[];
		/** Capture radius in value units. Inside it the pointer hands the value to the detent. */
		pull?: number;
		/** Visible label, wired to the slider with aria-labelledby. */
		label?: string;
		/** Formats the readout and the spoken value. Also sizes the readout cell up front. */
		format?: (value: number) => string;
		/** Sets aria-disabled and refuses input without removing the control from the page. */
		disabled?: boolean;
		/** Fires navigator.vibrate on detent capture where supported, once per crossing. */
		haptic?: boolean;
	}

	/** Thumb width in px. Position is a percentage translate inside a track inset by half of it. */
	const THUMB = 18;

	/** The fill and the thumb travelling to the value. */
	const CARRIAGE = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	const tidy = (value: number) => Math.round(value * 1e6) / 1e6;

	let {
		class: className,
		min = 0,
		max = 100,
		value = $bindable(min),
		onValueChange,
		step = 1,
		detents = [],
		pull,
		label = 'Value',
		format = (n: number) => String(n),
		disabled = false,
		haptic = true,
		...restProps
	}: SliderDetentsProps = $props();

	const uid = $props.id();
	const labelId = `${uid}-label`;

	let trackEl = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	function isNumberDetent(entry: number | SliderDetent): entry is number {
		return typeof entry === 'number';
	}

	const list = $derived(detents.map((entry) => (isNumberDetent(entry) ? { value: entry } : entry)));
	const span = $derived(max - min);
	const grab = $derived(pull ?? span * 0.045);
	const activeDetent = $derived(list.findIndex((d) => tidy(d.value) === tidy(value)));
	const percent = $derived(span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0);

	const detentLabel = $derived(list[activeDetent]?.label ?? '');
	const valueText = $derived(detentLabel ? `${format(value)}, ${detentLabel}` : format(value));

	// The readout cell is sized to the widest reachable string up front, so the
	// number holds still while the label beside it crossfades in.
	const widest = $derived.by(() => {
		const options = [
			format(min),
			format(max),
			...list.map((d) => (d.label ? `${format(d.value)} · ${d.label}` : format(d.value)))
		];
		return options.reduce((a, b) => (b.length > a.length ? b : a), '');
	});

	// The label fades out with its text intact rather than vanishing mid-crossfade.
	let remembered = '';
	const lastLabel = $derived.by(() => {
		if (detentLabel) remembered = detentLabel;
		return remembered;
	});

	/** Which detent last claimed the value; drives one buzz per crossing, never per frame. */
	let marked = untrack(() => list.findIndex((d) => tidy(d.value) === tidy(value)));
	let held = false;

	function commit(next: number) {
		const settled = Math.min(max, Math.max(min, tidy(next)));
		const index = list.findIndex((d) => tidy(d.value) === settled);
		if (index !== marked) {
			marked = index;
			if (haptic && index >= 0) navigator.vibrate?.(6);
		}
		if (settled !== value) {
			value = settled;
			onValueChange?.(settled);
		}
	}

	/** Resolves a pointer x into either a captured detent or the nearest step. */
	function capture(clientX: number): number | null {
		const el = trackEl;
		if (!el || span <= 0) return null;
		const rect = el.getBoundingClientRect();
		const travel = rect.width - THUMB;
		if (travel <= 0) return null;

		const ratio = (clientX - rect.left - THUMB / 2) / travel;
		const raw = Math.min(max, Math.max(min, min + ratio * span));

		let index = -1;
		let nearest = grab;
		for (let i = 0; i < list.length; i += 1) {
			const distance = Math.abs(raw - list[i].value);
			if (distance <= nearest) {
				nearest = distance;
				index = i;
			}
		}
		if (index >= 0) return list[index].value;
		return min + Math.round((raw - min) / step) * step;
	}

	function release() {
		if (!held) return;
		held = false;
		dragging = false;
	}

	/** Shift+arrow, PageUp and PageDown jump detent to detent rather than by step. */
	function toDetent(direction: number) {
		const sorted = list.map((d) => d.value).sort((a, b) => a - b);
		const forward = sorted.find((d) => d > value + 1e-6);
		const backward = sorted.filter((d) => d < value - 1e-6).pop();
		const target = direction > 0 ? forward : backward;
		commit(target ?? (direction > 0 ? max : min));
	}

	function handlePointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		event.currentTarget.focus({ preventScroll: true });
		held = true;
		dragging = true;
		const next = capture(event.clientX);
		if (next !== null) commit(next);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!held) return;
		const next = capture(event.clientX);
		if (next !== null) commit(next);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
		const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';

		if (forward || back) {
			const direction = forward ? 1 : -1;
			// Arrow keys move by exactly one step and ignore capture, so the
			// values between detents stay reachable without a pointer.
			if (event.shiftKey) toDetent(direction);
			else commit(value + direction * step);
		} else if (event.key === 'PageUp') {
			toDetent(1);
		} else if (event.key === 'PageDown') {
			toDetent(-1);
		} else if (event.key === 'Home') {
			commit(min);
		} else if (event.key === 'End') {
			commit(max);
		} else {
			return;
		}
		event.preventDefault();
	}
</script>

<svelte:window onblur={release} />

<div
	{...restProps}
	data-slot="slider-detents"
	data-dragging={dragging ? 'true' : undefined}
	class={cn('w-full select-none', className)}
>
	<div class="mb-2.5 flex items-baseline justify-between gap-3">
		<span id={labelId} class="text-muted-foreground text-[12.5px]">{label}</span>
		<span class="grid justify-items-start">
			<span
				aria-hidden="true"
				class="invisible col-start-1 row-start-1 font-mono text-[11px] whitespace-pre tabular-nums"
				>{widest}</span
			>
			<span
				aria-hidden="true"
				class="text-foreground col-start-1 row-start-1 font-mono text-[11px] whitespace-pre tabular-nums"
				>{format(value)}<span
					class="text-muted-foreground"
					{@attach motionTo(() => ({
						keyframes: { opacity: detentLabel ? 1 : 0 },
						transition: CROSSFADE
					}))}>{lastLabel ? ` · ${lastLabel}` : ''}</span
				></span
			>
		</span>
	</div>

	<div
		bind:this={trackEl}
		role="slider"
		tabindex="0"
		aria-orientation="horizontal"
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext={valueText}
		aria-disabled={disabled ? 'true' : undefined}
		aria-labelledby={labelId}
		style:touch-action="none"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={release}
		onpointercancel={release}
		onlostpointercapture={release}
		onkeydown={handleKeyDown}
		class={cn(
			'focus-visible:bg-primary/5 relative h-9 w-full rounded-[9px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
			disabled ? 'pointer-events-none opacity-50' : dragging ? 'cursor-grabbing' : 'cursor-grab'
		)}
	>
		<div
			class="bg-foreground/15 pointer-events-none absolute inset-x-0 top-[9px] h-[10px] overflow-hidden rounded-[5px]"
		>
			<div class="absolute inset-y-0" style:left="{THUMB / 2}px" style:right="{THUMB / 2}px">
				<div
					class="absolute inset-y-0 right-0 left-0"
					{@attach motionTo(() => ({
						keyframes: { x: `${percent * 100}%` },
						transition: CARRIAGE
					}))}
				>
					<div class="bg-foreground absolute inset-y-0 right-full w-[2000px]"></div>
				</div>
			</div>
		</div>

		<div
			class="pointer-events-none absolute inset-y-0"
			style:left="{THUMB / 2}px"
			style:right="{THUMB / 2}px"
		>
			{#each list as detent (detent.value)}
				<span
					aria-hidden="true"
					class="bg-foreground/35 absolute top-[26px] block h-[5px] w-[2px] -translate-x-1/2"
					style:left={span > 0 ? `${((detent.value - min) / span) * 100}%` : '0%'}
				></span>
			{/each}
		</div>

		<div
			class="pointer-events-none absolute inset-y-0"
			style:left="{THUMB / 2}px"
			style:right="{THUMB / 2}px"
		>
			<div
				class="absolute inset-y-0 right-0 left-0"
				{@attach motionTo(() => ({
					keyframes: { x: `${percent * 100}%` },
					transition: CARRIAGE
				}))}
			>
				<div
					class="border-background bg-foreground absolute top-[4px] h-[20px] w-[18px] rounded-[6px] border-2"
					style:margin-left="{-THUMB / 2}px"
					{@attach motionTo(() => ({
						keyframes: { scale: dragging ? 1.08 : 1 },
						transition: GRAB
					}))}
				></div>
			</div>
		</div>
	</div>
</div>
