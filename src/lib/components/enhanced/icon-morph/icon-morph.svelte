<script module lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	export type IconMorphState = {
		d: readonly string[];
		rotate?: number;
	};

	export type IconMorphMode = 'stroke' | 'fill';

	export type IconMorphPreset = 'menu-close' | 'play-pause' | 'plus-minus' | 'check-close';

	export type IconMorphSlot = {
		key: number;
		d: string;
		visible: boolean;
	};

	export type IconMorphSemantics = 'label' | 'pressed' | 'expanded';

	export interface IconMorphProps extends Omit<
		HTMLButtonAttributes,
		'children' | 'disabled' | 'type'
	> {
		/** Built-in state pair. Every preset ships its paths on a shared command signature. */
		preset?: IconMorphPreset;
		/** Your own states: `{ d, rotate? }` per state. Two or more; the button cycles through them. */
		states?: readonly IconMorphState[];
		/** Stroked outlines or filled bodies. Defaults to the preset's own mode. */
		mode?: IconMorphMode;
		/** One per state. Becomes the accessible name, and the visible text when `showLabel` is set. */
		labels?: readonly string[];
		/** Active state index. Bindable; wraps on activation. */
		active?: number;
		onActiveChange?: (index: number) => void;
		/** Icon box in px. The 24-unit viewBox scales to it; the button stays 36px tall. */
		size?: number;
		strokeWidth?: number;
		showLabel?: boolean;
		/** Which ARIA state index 1 reports: none, `aria-pressed`, or `aria-expanded`. */
		semantics?: IconMorphSemantics;
		disabled?: boolean;
	}

	// Typed explicitly per preset so every preset's `states` field carries the same
	// element type — including the presets below that never set `rotate`.
	const MENU_CLOSE_STATES: readonly IconMorphState[] = [
		{ rotate: 0, d: ['M 4 7 L 20 7', 'M 4 12 L 20 12', 'M 4 17 L 20 17'] },
		{ rotate: 90, d: ['M 6.5 6.5 L 17.5 17.5', 'M 12 12 L 12 12', 'M 6.5 17.5 L 17.5 6.5'] }
	];
	const PLAY_PAUSE_STATES: readonly IconMorphState[] = [
		{ d: ['M 8 5 L 14 8.5 L 14 15.5 L 8 19 Z', 'M 14 8.5 L 20 12 L 20 12 L 14 15.5 Z'] },
		{ d: ['M 8 5 L 11.5 5 L 11.5 19 L 8 19 Z', 'M 15 5 L 18.5 5 L 18.5 19 L 15 19 Z'] }
	];
	const PLUS_MINUS_STATES: readonly IconMorphState[] = [
		{ rotate: 0, d: ['M 5 12 L 19 12', 'M 12 5 L 12 19'] },
		{ rotate: 180, d: ['M 5 12 L 19 12', 'M 5 12 L 19 12'] }
	];
	const CHECK_CLOSE_STATES: readonly IconMorphState[] = [
		{ d: ['M 5 12.5 L 10 17.5 L 19.5 7', 'M 12 12 L 12 12 L 12 12'] },
		{ d: ['M 6.5 6.5 L 12 12 L 17.5 17.5', 'M 17.5 6.5 L 12 12 L 6.5 17.5'] }
	];

	export const iconMorphPresets = {
		'menu-close': { mode: 'stroke', labels: ['Menu', 'Close'], states: MENU_CLOSE_STATES },
		'play-pause': { mode: 'fill', labels: ['Play', 'Pause'], states: PLAY_PAUSE_STATES },
		'plus-minus': { mode: 'stroke', labels: ['Add', 'Remove'], states: PLUS_MINUS_STATES },
		'check-close': { mode: 'stroke', labels: ['Confirm', 'Cancel'], states: CHECK_CLOSE_STATES }
	} satisfies Record<
		IconMorphPreset,
		{ mode: IconMorphMode; labels: readonly string[]; states: readonly IconMorphState[] }
	>;

	const NUMBER = /-?\d*\.?\d+/g;
	const CENTER = '12';

	/** A path whose coordinates all collapse onto one point draws nothing and is faded out. */
	function isCollapsed(d: string): boolean {
		const nums = d.match(NUMBER);
		if (!nums || nums.length < 4) return false;
		return nums.every((n, i) => n === nums[i % 2]);
	}

	/** Pads every state to the same slot count so the number of paths never changes mid-flight. */
	function normalize(states: readonly IconMorphState[]): IconMorphSlot[][] {
		const count = states.reduce((most, s) => Math.max(most, s.d.length), 0);

		return states.map((state) =>
			Array.from({ length: count }, (_, i) => {
				const own = state.d[i];
				const sibling = states.find((s) => s.d[i] !== undefined)?.d[i] ?? '';
				const d = own ?? sibling.replace(NUMBER, CENTER);
				return { key: i, d, visible: !isCollapsed(d) };
			})
		);
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { motionPress, motionTo } from '$lib/motion.js';

	/** The shape itself morphing, and the frame rotating under it. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** The label trading places with the next one. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	let {
		class: className,
		preset = 'menu-close',
		states,
		mode,
		labels,
		active = $bindable(0),
		onActiveChange,
		size = 20,
		strokeWidth = 1.75,
		showLabel = false,
		semantics = 'label',
		disabled = false,
		...restProps
	}: IconMorphProps = $props();

	const preferences = $derived(iconMorphPresets[preset] ?? iconMorphPresets['menu-close']);
	const source = $derived(states ?? preferences.states);
	const names = $derived(labels ?? preferences.labels);
	const stroked = $derived((mode ?? preferences.mode) === 'stroke');
	const count = $derived(source.length);
	const index = $derived(count === 0 ? 0 : Math.min(Math.max(Math.trunc(active), 0), count - 1));

	const frames = $derived(normalize(source));
	const slots = $derived(frames[index] ?? []);
	const label = $derived(names[index] ?? '');
	const rotate = $derived(source[index]?.rotate ?? 0);

	function toggle() {
		if (disabled || count === 0) return;
		const wrapped = (((index + 1) % count) + count) % count;
		active = wrapped;
		onActiveChange?.(wrapped);
	}
</script>

<button
	{...restProps}
	type="button"
	{disabled}
	data-slot="icon-morph"
	data-index={index}
	aria-label={label}
	aria-pressed={semantics === 'pressed' ? index === 1 : undefined}
	aria-expanded={semantics === 'expanded' ? index === 1 : undefined}
	onclick={toggle}
	class={cn(
		'border-border bg-card text-foreground focus-visible:ring-ring/50 inline-flex h-9 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-[9px] border text-[13px] font-medium outline-none select-none focus-visible:ring-2 disabled:opacity-50',
		showLabel ? 'px-3' : 'w-9',
		className
	)}
	{@attach disabled ? undefined : motionPress({ y: 1 }, { y: 0 }, CELL)}
>
	<span
		aria-hidden="true"
		class="grid shrink-0 place-items-center"
		style:width="{size}px"
		style:height="{size}px"
		{@attach motionTo(() => ({ keyframes: { rotate }, transition: CELL }))}
	>
		<svg
			viewBox="0 0 24 24"
			width={size}
			height={size}
			focusable="false"
			fill={stroked ? 'none' : 'currentColor'}
			stroke={stroked ? 'currentColor' : 'none'}
			stroke-width={stroked ? strokeWidth : undefined}
			stroke-linecap="round"
			stroke-linejoin="round"
			class="block"
		>
			{#each slots as slot (slot.key)}
				<!-- Every state normalises to the same command signature, so Motion can
				     interpolate one path into the next instead of crossfading two icons. -->
				<path
					d={slot.d}
					{@attach motionTo(() => ({
						keyframes: { d: slot.d, opacity: slot.visible ? 1 : 0 },
						transition: CELL
					}))}
				/>
			{/each}
		</svg>
	</span>

	{#if showLabel}
		<span aria-hidden="true" class="grid">
			{#each names as text, i (`${i}-${text}`)}
				<span
					class="col-start-1 row-start-1 whitespace-nowrap"
					{@attach motionTo(() => ({
						keyframes: {
							opacity: i === index ? 1 : 0,
							y: i === index ? 0 : i < index ? -3 : 3
						},
						transition: CROSSFADE
					}))}
				>
					{text}
				</span>
			{/each}
		</span>
	{/if}
</button>
