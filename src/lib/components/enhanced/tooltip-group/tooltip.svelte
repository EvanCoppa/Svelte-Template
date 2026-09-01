<script lang="ts" module>
	export type TooltipSide = 'top' | 'bottom';

	/** Cold arrival: it rises, unblurs and scales up into place. */
	const RISE = { type: 'spring', stiffness: 560, damping: 34, mass: 0.6 } as const;
	/** Warm arrival: no travel, just a very fast opacity. */
	const WARM = { type: 'spring', stiffness: 900, damping: 48, mass: 0.5 } as const;
	/** The seat gliding from the tooltip it just replaced to this one. */
	const GLIDE = { type: 'spring', stiffness: 520, damping: 40, mass: 0.75 } as const;
	/** The label swapping inside a seat that is already on screen. */
	const SWAP = { type: 'spring', stiffness: 700, damping: 44, mass: 0.5 } as const;
	/** Leaving is a tween: a dismissal should not bounce. */
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];

	function isKeyboardFocus(el: HTMLElement) {
		try {
			return el.matches(':focus-visible');
		} catch {
			return true;
		}
	}
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTransition, reducedMotion } from '$lib/motion.js';
	import { TooltipStore, useTooltipGroup } from './tooltip-store.svelte.js';

	export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** What the tooltip says. A snippet when it needs more than one run of text. */
		label: string | Snippet;
		/**
		 * The trigger. It is handed the tooltip's id while the tooltip is on screen —
		 * put it on `aria-describedby` so a screen reader reads the label once on
		 * focus rather than on every pointer pass.
		 */
		children: Snippet<[string | undefined]>;
		/** Which side of the trigger the tooltip sits on. */
		side?: TooltipSide;
		/** Suppresses the tooltip and closes it if it is already up. */
		disabled?: boolean;
		/** Ignored inside a `TooltipGroup`, which owns the shared timing. */
		openDelay?: number;
		/** Ignored inside a `TooltipGroup`, which owns the shared timing. */
		closeDelay?: number;
		/** Ignored inside a `TooltipGroup`, which owns the shared timing. */
		skipDelay?: number;
		/** Classes for the tooltip bubble itself. */
		contentClass?: string;
	}

	let {
		class: className = '',
		label,
		children,
		side = 'top',
		disabled = false,
		openDelay = 200,
		closeDelay = 120,
		skipDelay = 400,
		contentClass = '',
		...restProps
	}: TooltipProps = $props();

	const uid = $props.id();
	const tooltipId = `tt-${uid}`;

	// Inside a group every trigger shares one seat and one set of delays; alone, a
	// tooltip keeps a private store with the same behaviour.
	const group = useTooltipGroup();
	const solo = group ? null : new TooltipStore(() => ({ openDelay, closeDelay, skipDelay }));
	// SAFETY: solo is non-null exactly when group is null (see the ternary above),
	// so the `??` fallback always resolves to a real store.
	const store = group ?? (solo as TooltipStore);

	let bubbleEl = $state<HTMLElement | null>(null);
	let running: { stop: () => void }[] = [];

	const open = $derived(store.active === tooltipId);
	const lift = $derived(side === 'top' ? 7 : -7);

	store.register(tooltipId, () => bubbleEl?.getBoundingClientRect() ?? null);

	onDestroy(() => {
		store.close(tooltipId, true);
		store.unregister(tooltipId);
		solo?.dispose();
	});

	$effect(() => {
		if (!disabled) return;
		store.close(tooltipId, true);
	});

	function onWindowBlur() {
		if (group) return;
		store.reset();
	}

	function onVisibilityChange() {
		if (group) return;
		if (document.hidden) store.reset();
	}

	function onPointerEnter(event: PointerEvent) {
		if (!disabled) store.open(tooltipId, false, event.clientX);
	}

	function onPointerLeave() {
		store.unblock(tooltipId);
		store.close(tooltipId, false);
	}

	function onPointerDown() {
		store.dismiss(tooltipId);
	}

	function onPointerCancel() {
		store.unblock(tooltipId);
		store.close(tooltipId, true);
	}

	// Focus opens the tooltip only when the browser reports :focus-visible, so
	// clicking a button does not park a tooltip over the thing you just clicked.
	function onFocusIn(event: FocusEvent) {
		if (disabled) return;
		const target = event.target;
		if (!(target instanceof HTMLElement) || !isKeyboardFocus(target)) return;
		store.open(tooltipId, true);
	}

	function onFocusOut() {
		store.unblock(tooltipId);
		store.close(tooltipId, true);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') store.dismiss(tooltipId);
	}

	function enterBubble(node: HTMLElement) {
		return untrack(() => {
			if (reducedMotion.current) return;

			const skipped = store.skipped;
			const from = store.takeRect();

			if (skipped && from) {
				// The seat travels from the tooltip it replaced instead of being born
				// again in place: same box, new position and width.
				const to = node.getBoundingClientRect();
				running.push(
					animate(
						node,
						{
							x: [from.left - to.left, 0],
							y: [from.top - to.top, 0],
							width: [`${from.width}px`, `${to.width}px`]
						},
						GLIDE
					),
					animate(node, { opacity: [0, 1] }, WARM)
				);
			} else if (skipped) {
				running.push(animate(node, { opacity: [0, 1] }, WARM));
			} else {
				running.push(
					animate(
						node,
						{
							opacity: [0, 1],
							scale: [0.9, 1],
							y: [lift, 0],
							filter: ['blur(4px)', 'blur(0px)']
						},
						RISE
					)
				);
			}

			return () => {
				for (const controls of running) controls.stop();
				running = [];
			};
		});
	}

	function enterLabel(node: HTMLElement) {
		return untrack(() => {
			if (reducedMotion.current) return;
			const controls = store.skipped
				? animate(node, { opacity: [0, 1], x: [store.travel * 14, 0] }, SWAP)
				: animate(node, { opacity: [0, 1], y: [9, 0] }, SWAP);
			running.push(controls);
			return () => controls.stop();
		});
	}

	function bubbleOut(node: Element, { away }: { away: number }) {
		// Stop the entry first, or two animations would be writing the same
		// transform at once and the exit would fight whatever the entry still owns.
		for (const controls of running) controls.stop();
		running = [];

		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.96, y: away * 0.35, filter: 'blur(2px)' },
			transition: { duration: 0.12, ease: LEAVE },
			reduced: { keyframes: { opacity: 0 }, transition: { duration: 0 } }
		});
	}
</script>

<svelte:window onblur={onWindowBlur} />
<svelte:document onvisibilitychange={onVisibilityChange} />

<span
	{...restProps}
	class={cn('relative inline-flex', className)}
	onpointerenter={onPointerEnter}
	onpointerleave={onPointerLeave}
	onpointerdown={onPointerDown}
	onpointercancel={onPointerCancel}
	onfocusin={onFocusIn}
	onfocusout={onFocusOut}
	onkeydown={onKeyDown}
>
	{@render children(open ? tooltipId : undefined)}

	<!-- Mounted outside the flow, so opening one moves nothing around it. -->
	<span
		aria-hidden={!open}
		style={side === 'top' ? 'bottom: calc(100% + 7px)' : 'top: calc(100% + 7px)'}
		class="pointer-events-none absolute left-1/2 z-50 flex w-0 justify-center"
	>
		{#if open}
			<span
				bind:this={bubbleEl}
				{@attach enterBubble}
				out:bubbleOut={{ away: lift }}
				role="tooltip"
				id={tooltipId}
				style:transform-origin={side === 'top' ? '50% 100%' : '50% 0%'}
				class={cn(
					'text-foreground relative w-max max-w-[220px] shrink-0 overflow-hidden rounded-[8px] px-2 py-1 text-[11.5px] leading-snug font-medium',
					contentClass
				)}
			>
				<span
					aria-hidden="true"
					class="border-border bg-card absolute inset-0 rounded-[8px] border shadow-[0_1px_2px_rgba(28,25,23,0.06),0_6px_16px_-12px_rgba(28,25,23,0.35)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
				></span>
				<span {@attach enterLabel} class="relative block whitespace-nowrap">
					{#if typeof label === 'function'}
						{@render label()}
					{:else}
						{label}
					{/if}
				</span>
			</span>
		{/if}
	</span>
</span>
