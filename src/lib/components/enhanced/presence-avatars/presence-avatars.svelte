<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition } from '$lib/motion.js';

	/** A slot filling or emptying, and the rail resizing around it. */
	const SLOT = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	import PresenceTile from './presence-tile.svelte';

	export type PresencePerson = {
		/** The identity that survives a re-render, so a reconnect returns to its slot. */
		id: string;
		name: string;
		src?: string;
	};

	export interface PresenceAvatarsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The room, in any order. */
		people: PresencePerson[];
		/** Avatar slots drawn before the overflow chip takes over. */
		max?: number;
		/** Edge of one square tile in pixels. Font size and rail width derive from it. */
		size?: number;
		/** Pixels each tile hides of the one before it. */
		overlap?: number;
		/** Accessible name for the group. */
		label?: string;
		/** Quiet period before the roster summary reaches the live region. */
		announceAfter?: number;
		/** Given, the overflow chip becomes a real button and receives the hidden people. */
		onOverflowSelect?: (hidden: PresencePerson[]) => void;
	}

	let {
		class: className,
		people,
		max = 5,
		size = 28,
		overlap = 9,
		label = 'People here',
		announceAfter = 900,
		onOverflowSelect,
		...restProps
	}: PresenceAvatarsProps = $props();

	let announcement = $state('');

	// First-seen order, so an arrival cannot reshuffle the people already present.
	// Deliberately a plain Map, against prefer-svelte-reactivity: `ordered` below
	// assigns slots while it runs, and writing *reactive* state inside a `$derived`
	// throws state_unsafe_mutation — which killed hydration for the whole page. This
	// is a pure memo of arrival order, read only inside that derived and never
	// rendered, so reactivity would buy nothing and cost a self-dependency.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seen = new Map<string, number>();
	let nextSlot = 0;

	const ordered = $derived.by(() => {
		for (const person of people) {
			if (!seen.has(person.id)) {
				seen.set(person.id, nextSlot);
				nextSlot += 1;
			}
		}
		return people.slice().sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0));
	});

	const slots = $derived(Math.max(1, max));
	const visible = $derived(ordered.slice(0, slots));
	const hidden = $derived(ordered.slice(slots));
	const overflow = $derived(hidden.length);

	const step = $derived(size - overlap);
	const chip = $derived(size + 8);

	// The rail is exactly as wide as who is actually here.
	const rail = $derived(
		visible.length === 0
			? 0
			: overflow > 0
				? visible.length * step + chip
				: (visible.length - 1) * step + size
	);

	const chipCount = $derived(`+${Math.min(overflow, 99)}`);
	const summary = $derived(describe(ordered.map((person) => person.name)));

	function describe(names: string[]): string {
		if (names.length === 0) return 'Nobody here';
		if (names.length === 1) return `${names[0]} is here`;
		if (names.length === 2) return `${names[0]} and ${names[1]} are here`;
		const rest = names.length - 2;
		return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'} are here`;
	}

	// A burst of joins collapses into one announcement.
	$effect(() => {
		const settled = summary;
		const timer = setTimeout(
			() => {
				announcement = settled;
			},
			Math.max(0, announceAfter)
		);
		return () => clearTimeout(timer);
	});

	/**
	 * Motion composes every transform value it holds for an element, so a slot
	 * can scale on the way in while its placement `x` is owned by a separate
	 * animation — neither clobbers the other's transform.
	 */
	function slotIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], scale: [0.86, 1] },
			transition: SLOT
		});
	}

	function slotOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.86 },
			transition: SLOT
		});
	}
</script>

<div
	{...restProps}
	role="group"
	aria-label={label}
	class={cn('inline-flex items-center', className)}
>
	<div
		class="relative shrink-0"
		style:height={`${size}px`}
		{@attach motionTo(() => ({ keyframes: { width: rail }, transition: SLOT }))}
	>
		{#each visible as person, i (person.id)}
			<span
				aria-hidden="true"
				class="absolute top-0 left-0"
				style:width={`${size}px`}
				style:height={`${size}px`}
				style:z-index={slots - i}
				in:slotIn
				out:slotOut
				{@attach motionTo(() => ({ keyframes: { x: i * step }, transition: SLOT }))}
			>
				<PresenceTile name={person.name} src={person.src} {size} />
			</span>
		{/each}

		{#if overflow > 0}
			{#if onOverflowSelect}
				<button
					type="button"
					onclick={() => onOverflowSelect(hidden)}
					aria-label={`Show ${overflow} more`}
					class="chip border-border bg-card text-muted-foreground ring-background absolute top-0 left-0 grid cursor-pointer place-items-center rounded-[9px] border font-mono text-[10.5px] leading-none tabular-nums ring-2 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
					style:width={`${chip}px`}
					style:height={`${size}px`}
					style:z-index="0"
					in:slotIn
					out:slotOut
					{@attach motionTo(() => ({
						keyframes: { x: visible.length * step },
						transition: SLOT
					}))}
				>
					<span aria-hidden="true">{chipCount}</span>
				</button>
			{:else}
				<span
					aria-hidden="true"
					class="chip border-border bg-card text-muted-foreground ring-background absolute top-0 left-0 grid place-items-center rounded-[9px] border font-mono text-[10.5px] leading-none tabular-nums ring-2"
					style:width={`${chip}px`}
					style:height={`${size}px`}
					style:z-index="0"
					in:slotIn
					out:slotOut
					{@attach motionTo(() => ({
						keyframes: { x: visible.length * step },
						transition: SLOT
					}))}
				>
					{chipCount}
				</span>
			{/if}
		{/if}
	</div>

	<!-- The roster behind the chip stays readable as a list, not a number. -->
	<ul class="sr-only">
		{#each ordered as person (person.id)}
			<li>{person.name}</li>
		{/each}
	</ul>

	<span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{announcement}</span>
</div>
