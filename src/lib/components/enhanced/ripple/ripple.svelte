<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { SvelteMap } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	export type RippleSpec = {
		id: number;
		x: number;
		y: number;
		scale: number;
		released: boolean;
	};

	export interface RippleProps extends Omit<
		HTMLButtonAttributes,
		| 'children'
		| 'disabled'
		| 'onpointerdown'
		| 'onpointerup'
		| 'onpointercancel'
		| 'onlostpointercapture'
		| 'onkeydown'
		| 'onkeyup'
		| 'onblur'
	> {
		children?: Snippet;
		disabled?: boolean;
		/** Ceiling on simultaneous blooms. A hammered key evicts the oldest instead of growing the DOM. */
		max?: number;
		/** Shortest time a bloom stays at full opacity, so a forty millisecond tap still reads. */
		minVisible?: number;
		/** Milliseconds the released bloom takes to fade out. */
		fade?: number;
		/** The bloom fill. Swap it when the surface is dark, inverted, or tinted with a brand colour. */
		tintClass?: string;
	}

	/** The ripple is a fixed patch scaled up to reach — nothing here touches layout. */
	const BASE = 40;
	/** The bloom is deliberately linear: a spring would read as a bounce. */
	const BLOOM = { duration: 0.5, ease: 'linear' } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

	let {
		class: className,
		children,
		type = 'button',
		disabled = false,
		max = 4,
		minVisible = 220,
		fade = 320,
		tintClass = 'bg-foreground/15 dark:bg-foreground/20',
		...restProps
	}: RippleProps = $props();

	let ripples = $state<RippleSpec[]>([]);

	let seq = 0;
	const born = new SvelteMap<number, number>();
	const timers = new SvelteMap<number, ReturnType<typeof setTimeout>[]>();
	const pointers = new SvelteMap<number, number>();
	let keyed: number | null = null;

	onDestroy(() => {
		timers.forEach((set) => set.forEach(clearTimeout));
		timers.clear();
		born.clear();
	});

	function forget(id: number) {
		timers.get(id)?.forEach(clearTimeout);
		timers.delete(id);
		born.delete(id);
	}

	function spawn(el: HTMLElement, clientX?: number, clientY?: number): number {
		const rect = el.getBoundingClientRect();
		const x = Math.round(clientX === undefined ? rect.width / 2 : clientX - rect.left);
		const y = Math.round(clientY === undefined ? rect.height / 2 : clientY - rect.top);
		const reach = Math.max(
			Math.hypot(x, y),
			Math.hypot(rect.width - x, y),
			Math.hypot(x, rect.height - y),
			Math.hypot(rect.width - x, rect.height - y)
		);

		const cap = Math.max(1, Math.trunc(max));
		let next = ripples;
		while (next.length >= cap) {
			forget(next[0].id);
			next = next.slice(1);
		}

		const id = ++seq;
		born.set(id, performance.now());
		ripples = [
			...next,
			{ id, x, y, scale: Math.round((reach * 200) / BASE) / 100, released: false }
		];
		return id;
	}

	function release(id: number) {
		if (timers.has(id)) return;
		if (!ripples.some((r) => r.id === id)) return;

		const wait = Math.max(0, minVisible - (performance.now() - (born.get(id) ?? 0)));

		const start = setTimeout(() => {
			const hit = ripples.find((r) => r.id === id);
			if (hit) hit.released = true;
		}, wait);

		const drop = setTimeout(() => {
			forget(id);
			ripples = ripples.filter((r) => r.id !== id);
		}, wait + fade);

		timers.set(id, [start, drop]);
	}

	function releaseAll() {
		pointers.forEach((id) => release(id));
		pointers.clear();
		if (keyed !== null) {
			release(keyed);
			keyed = null;
		}
	}

	function endPointer(pointerId: number) {
		const id = pointers.get(pointerId);
		if (id === undefined) return;
		pointers.delete(pointerId);
		release(id);
	}

	function handlePointerDown(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (pointers.has(event.pointerId)) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		pointers.set(event.pointerId, spawn(event.currentTarget, event.clientX, event.clientY));
	}

	function handlePointerEnd(event: PointerEvent) {
		endPointer(event.pointerId);
	}

	function handleKeyDown(event: KeyboardEvent & { currentTarget: HTMLButtonElement }) {
		if (disabled || event.repeat || keyed !== null) return;
		if (event.key !== ' ' && event.key !== 'Enter') return;
		keyed = spawn(event.currentTarget);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (keyed === null) return;
		if (event.key !== ' ' && event.key !== 'Enter' && event.key !== 'Escape') return;
		release(keyed);
		keyed = null;
	}

	function handleVisibilityChange() {
		if (document.hidden) releaseAll();
	}
</script>

<svelte:window onblur={releaseAll} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

<button
	{...restProps}
	{type}
	{disabled}
	data-slot="ripple"
	class={cn(
		'border-border bg-card text-foreground focus-visible:ring-ring/50 relative isolate inline-flex touch-manipulation items-center justify-center gap-2 rounded-[9px] border px-3.5 py-2 text-[13px] font-medium shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 disabled:opacity-50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]',
		className
	)}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerEnd}
	onpointercancel={handlePointerEnd}
	onlostpointercapture={handlePointerEnd}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	onblur={releaseAll}
>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
	>
		{#each ripples as ripple (ripple.id)}
			<span
				class={cn('absolute block rounded-full will-change-[transform,opacity]', tintClass)}
				style:left="{ripple.x - BASE / 2}px"
				style:top="{ripple.y - BASE / 2}px"
				style:width="{BASE}px"
				style:height="{BASE}px"
				{@attach motionTo(
					() => ({
						keyframes: ripple.released
							? { scale: ripple.scale, opacity: 0 }
							: {
									scale: reducedMotion.current ? ripple.scale : [0, ripple.scale],
									opacity: [0, 1]
								},
						transition: {
							scale: reducedMotion.current ? { duration: 0 } : BLOOM,
							opacity: {
								duration: ripple.released ? fade / 1000 : 0.07,
								ease: ripple.released ? EASE : 'linear'
							}
						}
					}),
					{ initial: true }
				)}
			></span>
		{/each}
	</span>

	<span class="relative">{@render children?.()}</span>
</button>
